import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { NotificationService } from "../notifications/notification.service";
import { CalendarOutboundSyncService } from "../calendar/calendar-outbound-sync.service";
import { CalendarInboundSyncService } from "../calendar/calendar-inbound-sync.service";
import { RedisService, RetryClassifier } from "@bookpro/server-core";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import * as os from "os";

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(OutboxDispatcherService.name);
    private readonly workerId = process.env.WORKER_ID || `worker-${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
    private pollTimer: NodeJS.Timeout | null = null;
    private reminderTimer: NodeJS.Timeout | null = null;
    private isProcessing = false;
    private readonly leaseDurationSec = 60;
    private readonly maxAttempts = 5;

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService,
        @Optional() private readonly calendarOutboundSync?: CalendarOutboundSyncService,
        @Optional() private readonly calendarInboundSync?: CalendarInboundSyncService,
        @Optional() private readonly redisService?: RedisService,
    ) { }

    onModuleInit() {
        this.logger.log(`Starting Outbox Event Dispatcher [Worker: ${this.workerId}] with leased claims (interval: 3s)...`);
        this.pollTimer = setInterval(() => this.pollAndDispatch(), 3000);
        this.reminderTimer = setInterval(() => this.pollScheduledNotifications(), 10000);
    }

    onModuleDestroy() {
        if (this.pollTimer) clearInterval(this.pollTimer);
        if (this.reminderTimer) clearInterval(this.reminderTimer);
    }

    getWorkerId(): string {
        return this.workerId;
    }

    /**
     * Atomically claims and dispatches pending outbox events using PostgreSQL FOR UPDATE SKIP LOCKED
     * with processing leases, stale recovery, retry backoff, dead-lettering, and per-handler idempotency.
     */
    async pollAndDispatch(): Promise<number> {
        if (this.isProcessing) return 0;
        this.isProcessing = true;

        try {
            // Leased Claim: Atomically claim up to 50 pending or expired-lease processing events
            const claimedEvents: any[] = await this.prisma.$transaction(async (tx) => {
                const rows: any[] = await tx.$queryRaw<any[]>(Prisma.sql`
                    WITH claimable AS (
                        SELECT id, status, lease_expires_at
                        FROM outbox_events
                        WHERE (status = 'PENDING' AND "availableAt" <= NOW())
                           OR (status = 'PROCESSING' AND "lease_expires_at" <= NOW())
                        ORDER BY "createdAt" ASC
                        LIMIT 50
                        FOR UPDATE SKIP LOCKED
                    )
                    UPDATE outbox_events o
                    SET status = 'PROCESSING',
                        worker_id = ${this.workerId},
                        claimed_at = NOW(),
                        lease_expires_at = NOW() + (${this.leaseDurationSec} * INTERVAL '1 second'),
                        attempts = o.attempts + 1
                    FROM claimable
                    WHERE o.id = claimable.id
                    RETURNING o.id, o."organizationId", o."aggregateType", o."aggregateId", o."eventType", o."eventVersion", o.payload, o.attempts, o.completed_handlers;
                `);

                return rows;
            });

            if (!claimedEvents || claimedEvents.length === 0) {
                return 0;
            }

            this.logger.log(`Claimed ${claimedEvents.length} Outbox events with leased claims [Worker: ${this.workerId}].`);

            for (const event of claimedEvents) {
                await this.processSingleEvent(event);
            }

            return claimedEvents.length;
        } catch (err: any) {
            this.logger.warn(`Outbox polling warning: ${err.message}`);
            return 0;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Processes a single claimed outbox event with granular per-handler idempotency tracking
     */
    async processSingleEvent(event: any): Promise<boolean> {
        const payload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
        const completedHandlers: string[] = Array.isArray(event.completed_handlers) ? [...event.completed_handlers] : [];

        try {
            // Handler 1: Notification Subsystem
            if (!completedHandlers.includes("notifications")) {
                await this.notificationService.handleOutboxEvent(
                    event.eventType,
                    payload,
                    event.id,
                    event.organizationId
                );
                await this.markHandlerCompleted(event.id, "notifications");
                completedHandlers.push("notifications");
            } else {
                this.logger.debug(`[Outbox] Event ${event.id}: Skipping already completed "notifications" handler.`);
            }

            // Handler 2: Google Calendar Outbound & Inbound Sync Engine
            if (!completedHandlers.includes("calendar_sync")) {
                if (this.calendarOutboundSync) {
                    if (event.eventType === "appointment.confirmed" || event.eventType === "appointment.created") {
                        await this.calendarOutboundSync.handleAppointmentConfirmed(payload);
                    } else if (event.eventType === "appointment.rescheduled") {
                        await this.calendarOutboundSync.handleAppointmentRescheduled(payload);
                    } else if (event.eventType === "appointment.cancelled") {
                        await this.calendarOutboundSync.handleAppointmentCancelled(payload);
                    }
                }

                if (this.calendarInboundSync && event.eventType === "calendar.inbound_sync_requested") {
                    await this.calendarInboundSync.syncConnection(payload.connectionId);
                }

                await this.markHandlerCompleted(event.id, "calendar_sync");
                completedHandlers.push("calendar_sync");
            } else {
                this.logger.debug(`[Outbox] Event ${event.id}: Skipping already completed "calendar_sync" handler.`);
            }

            // Handler 3: Real-time Pub/Sub Broadcast & Cache Invalidation
            if (!completedHandlers.includes("realtime_pubsub")) {
                if (this.redisService && this.redisService.getIsConnected()) {
                    const orgId = event.organizationId || payload.organizationId;
                    if (orgId) {
                        await this.redisService.publish(`realtime:${orgId}`, {
                            type: event.eventType,
                            entityId: event.aggregateId,
                            aggregateType: event.aggregateType,
                            version: event.eventVersion,
                            organizationId: orgId,
                            timestamp: new Date().toISOString(),
                        });

                        // If schedule-affecting event, invalidate availability cache
                        if (
                            event.eventType.startsWith("appointment.") ||
                            event.eventType.startsWith("booking_hold.") ||
                            event.eventType.startsWith("staff.")
                        ) {
                            const cachePrefix = `bookpro:${orgId}:availability:`;
                            await this.redisService.delPrefix(cachePrefix);
                        }
                    }
                }

                await this.markHandlerCompleted(event.id, "realtime_pubsub");
                completedHandlers.push("realtime_pubsub");
            } else {
                this.logger.debug(`[Outbox] Event ${event.id}: Skipping already completed "realtime_pubsub" handler.`);
            }

            // All handlers succeeded: Mark Outbox event PROCESSED
            await this.prisma.outboxEvent.update({
                where: { id: event.id },
                data: {
                    status: "PROCESSED",
                    processedAt: new Date(),
                    publishedAt: new Date(),
                    ...(["identity.email_verification_requested", "identity.staff_invitation_requested", "identity.customer_invitation_requested"].includes(event.eventType)
                        ? { payload: { userId: payload.userId, organizationId: payload.organizationId, delivery: "redacted_after_processing" } }
                        : {}),
                },
            });

            this.logger.log(`Dispatched Outbox event ${event.id} [${event.eventType}] successfully.`);
            return true;
        } catch (dispatchErr: any) {
            this.logger.error(`Error processing Outbox event ${event.id}: ${dispatchErr.message}`, dispatchErr.stack);

            const classification = RetryClassifier.classify(dispatchErr);
            const currentAttempts = event.attempts || 1;
            const isTerminal = !classification.isRetryable || currentAttempts >= this.maxAttempts;

            if (isTerminal) {
                await this.prisma.outboxEvent.update({
                    where: { id: event.id },
                    data: {
                        status: "DEAD_LETTER",
                        deadLetteredAt: new Date(),
                        lastError: dispatchErr.message || "Terminal failure reached",
                    },
                });
                this.logger.error(`Outbox event ${event.id} permanently dead-lettered after attempt ${currentAttempts}: ${dispatchErr.message}`);
            } else {
                const jitter = Math.floor(Math.random() * 1000);
                const backoffMs = Math.min(5000 * Math.pow(2, currentAttempts - 1) + jitter, 300000);
                const nextAvailableAt = new Date(Date.now() + backoffMs);

                await this.prisma.outboxEvent.update({
                    where: { id: event.id },
                    data: {
                        status: "PENDING",
                        workerId: null,
                        leaseExpiresAt: null,
                        availableAt: nextAvailableAt,
                        lastError: dispatchErr.message,
                    },
                });
                this.logger.warn(`Outbox event ${event.id} scheduled for retry at ${nextAvailableAt.toISOString()} (attempt ${currentAttempts}/${this.maxAttempts})`);
            }
            return false;
        }
    }

    /**
     * Atomically appends completed handler name to the outbox event record
     */
    private async markHandlerCompleted(eventId: string, handlerName: string): Promise<void> {
        try {
            await this.prisma.$executeRaw(Prisma.sql`
                UPDATE outbox_events
                SET completed_handlers = array_append(completed_handlers, ${handlerName})
                WHERE id = ${eventId}::uuid AND NOT (${handlerName} = ANY(completed_handlers));
            `);
        } catch (err: any) {
            this.logger.warn(`Failed to record handler completion "${handlerName}" for event ${eventId}: ${err.message}`);
        }
    }

    /**
     * Polls and processes scheduled queued notifications (e.g. 24h reminders)
     */
    async pollScheduledNotifications(): Promise<number> {
        try {
            return await this.notificationService.pollAndProcessQueuedNotifications();
        } catch (err: any) {
            this.logger.warn(`Scheduled notification polling warning: ${err.message}`);
            return 0;
        }
    }

    /**
     * Explicit stale claims reaper method for monitoring and manual invocations
     */
    async reapStaleClaims(): Promise<number> {
        try {
            const staleRows: any[] = await this.prisma.$queryRaw<any[]>(Prisma.sql`
                SELECT id, worker_id, lease_expires_at, attempts
                FROM outbox_events
                WHERE status = 'PROCESSING' AND "lease_expires_at" <= NOW();
            `);

            if (staleRows && staleRows.length > 0) {
                this.logger.warn(`[StaleReaper] Detected ${staleRows.length} stale outbox leases. Reclaiming...`);
            }

            return staleRows.length;
        } catch (err: any) {
            this.logger.warn(`Stale reaper check error: ${err.message}`);
            return 0;
        }
    }
}
