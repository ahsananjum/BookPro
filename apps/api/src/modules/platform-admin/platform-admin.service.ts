import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "@bookpro/server-core";
import {
    PlatformSystemHealthDto,
    PlatformTenantSummaryDto,
    PlatformFailedJobDto,
    PlatformWebhookFailureDto,
} from "@bookpro/contracts";

@Injectable()
export class PlatformAdminService {
    private readonly logger = new Logger(PlatformAdminService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService
    ) {}

    /**
     * Aggregates system-wide health and infrastructure telemetry.
     */
    async getSystemHealth(): Promise<PlatformSystemHealthDto> {
        // 1. Check Database
        const dbStart = Date.now();
        let dbStatus: "HEALTHY" | "DEGRADED" | "DOWN" = "HEALTHY";
        let dbLatency = 0;
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            dbLatency = Date.now() - dbStart;
        } catch {
            dbStatus = "DOWN";
        }

        // 2. Check Redis
        const redisStart = Date.now();
        let redisStatus: "HEALTHY" | "DEGRADED" | "DOWN" = "HEALTHY";
        let redisLatency = 0;
        try {
            if (this.redis.getIsConnected()) {
                const client = this.redis.getClient();
                if (client) {
                    await client.ping();
                    redisLatency = Date.now() - redisStart;
                }
            } else {
                redisStatus = "DEGRADED";
            }
        } catch {
            redisStatus = "DEGRADED"; // Redis optional fallback
        }

        // 3. Google Calendar Health
        const [totalGoogle, failingGoogle] = await Promise.all([
            this.prisma.googleCalendarConnection.count(),
            this.prisma.googleCalendarConnection.count({
                where: { status: { in: ["DEGRADED", "DISCONNECTED", "ACTION_REQUIRED"] } },
            }),
        ]);

        // 4. Job Queues / Outbox counts
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [outboxPending, outboxFailed, activeTenantsCount, bookings24h, stripeWebhooks24h, stripeFailures24h] = await Promise.all([
            this.prisma.outboxEvent.count({ where: { status: "PENDING" } }),
            this.prisma.outboxEvent.count({ where: { status: { in: ["FAILED", "FAILED_RETRYABLE"] } } }),
            this.prisma.organization.count({ where: { isActive: true } }),
            this.prisma.appointment.count({
                where: {
                    createdAt: { gte: last24Hours },
                },
            }),
            this.prisma.webhookInbox.count({ where: { provider: "STRIPE", createdAt: { gte: last24Hours } } }),
            this.prisma.webhookInbox.count({ where: { provider: "STRIPE", status: "FAILED", createdAt: { gte: last24Hours } } }),
        ]);

        return {
            timestamp: new Date().toISOString(),
            database: { status: dbStatus, latencyMs: dbLatency },
            redis: { status: redisStatus, latencyMs: redisLatency },
            integrations: {
                googleCalendar: { connectedCount: totalGoogle, failingCount: failingGoogle },
                stripe: { webhooks24h: stripeWebhooks24h, failures24h: stripeFailures24h },
                geminiAI: {
                    status: process.env.AI_ENABLED !== "true"
                        ? "DISABLED"
                        : process.env.GEMINI_API_KEY
                            ? "ACTIVE"
                            : "FALLBACK",
                },
            },
            jobQueues: {
                waiting: outboxPending,
                active: 0,
                failed: outboxFailed,
                delayed: 0,
            },
            activeTenantsCount,
            totalBookings24h: bookings24h,
        };
    }

    /**
     * Returns platform-wide tenant overview with operational counters.
     */
    async listTenants(): Promise<PlatformTenantSummaryDto[]> {
        const organizations = await this.prisma.organization.findMany({
            include: {
                locations: { select: { id: true } },
                staffProfiles: { select: { id: true } },
                entitlements: { include: { plan: true }, take: 1 },
                appointments: {
                    where: {
                        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                    },
                    select: { id: true },
                },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
        });

        return organizations.map((org) => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            planCode: org.entitlements[0]?.plan?.code || "STARTER",
            isActive: org.isActive,
            locationsCount: org.locations.length,
            staffCount: org.staffProfiles.length,
            monthlyBookingsCount: org.appointments.length,
            createdAt: org.createdAt.toISOString(),
        }));
    }

    /**
     * Returns recent failed outbox events / jobs for operational triage.
     */
    async listFailedJobs(): Promise<PlatformFailedJobDto[]> {
        const events = await this.prisma.outboxEvent.findMany({
            where: { status: { in: ["FAILED", "FAILED_RETRYABLE"] } },
            orderBy: { createdAt: "desc" },
            take: 50,
        });

        return events.map((e) => ({
            id: e.id,
            queueName: "outbox_dispatcher",
            name: e.eventType,
            organizationId: e.organizationId,
            failedReason: e.lastError || "Unknown failure",
            attemptsMade: e.attempts,
            timestamp: e.createdAt.getTime(),
        }));
    }

    /**
     * Audited platform support impersonation access.
     */
    async logSupportAccess(
        adminUserId: string,
        targetTenantId: string,
        reason: string
    ): Promise<{ accessGranted: boolean; sessionRef: string }> {
        const sessionRef = `supp_${Date.now()}_${adminUserId.slice(0, 8)}`;

        await this.prisma.auditLog.create({
            data: {
                organizationId: targetTenantId,
                actorType: "PLATFORM_SUPPORT",
                actorId: adminUserId,
                action: "support.tenant_access_initiated",
                resourceType: "organization",
                resourceId: targetTenantId,
                payload: {
                    reason,
                    sessionRef,
                    timestamp: new Date().toISOString(),
                },
            },
        });

        this.logger.warn(`[SupportAudit] Admin ${adminUserId} accessed tenant ${targetTenantId} (Reason: ${reason})`);

        return { accessGranted: true, sessionRef };
    }
}
