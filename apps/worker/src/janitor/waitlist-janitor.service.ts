import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class WaitlistJanitorService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(WaitlistJanitorService.name);
    private janitorTimer: NodeJS.Timeout | null = null;
    private isRunning = false;

    constructor(private readonly prisma: PrismaService) { }

    onModuleInit() {
        this.logger.log("Starting Waitlist Expiration Janitor (interval: 15s)...");
        this.janitorTimer = setInterval(() => this.cleanupExpiredWaitlist(), 15000);
    }

    onModuleDestroy() {
        if (this.janitorTimer) {
            clearInterval(this.janitorTimer);
        }
    }

    /**
     * Atomically cleans up expired waitlist offers and entries with transactional conditional updates.
     * Guarantees that only 1 worker process claims the expiration and emits the domain outbox event.
     */
    async cleanupExpiredWaitlist(): Promise<{ expiredOffersCount: number; expiredEntriesCount: number }> {
        if (this.isRunning) return { expiredOffersCount: 0, expiredEntriesCount: 0 };
        this.isRunning = true;

        let expiredOffersCount = 0;
        let expiredEntriesCount = 0;

        try {
            const now = new Date();

            // 1. Cleanup expired PENDING offers
            const candidateOffers = await this.prisma.waitlistOffer.findMany({
                where: {
                    status: "PENDING",
                    expiresAt: { lt: now },
                },
                select: {
                    id: true,
                    waitlistEntryId: true,
                    organizationId: true,
                    bookingHoldId: true,
                    serviceId: true,
                    locationId: true,
                    staffId: true,
                    startAt: true,
                    endAt: true,
                },
                take: 100,
            });

            for (const offer of candidateOffers) {
                const claimed = await this.prisma.$transaction(async (tx) => {
                    const updated = await tx.waitlistOffer.updateMany({
                        where: {
                            id: offer.id,
                            status: "PENDING",
                            expiresAt: { lt: now },
                        },
                        data: { status: "EXPIRED" },
                    });

                    if (updated.count > 0) {
                        // Release the associated BookingHold so the slot becomes free
                        if (offer.bookingHoldId) {
                            await tx.bookingHold.updateMany({
                                where: { id: offer.bookingHoldId, status: "ACTIVE" },
                                data: { status: "RELEASED" },
                            });
                        }

                        // Emit outbox event for expired offer inside the same transaction
                        await tx.outboxEvent.create({
                            data: {
                                organizationId: offer.organizationId,
                                aggregateType: "WaitlistOffer",
                                aggregateId: offer.id,
                                eventType: "waitlist.offer_expired",
                                payload: {
                                    offerId: offer.id,
                                    waitlistEntryId: offer.waitlistEntryId,
                                    organizationId: offer.organizationId,
                                    serviceId: offer.serviceId,
                                    locationId: offer.locationId,
                                    staffId: offer.staffId,
                                    startAt: offer.startAt.toISOString(),
                                    endAt: offer.endAt.toISOString(),
                                },
                                status: "PENDING",
                            },
                        });

                        // Revert waitlist entry to ACTIVE if no other pending offers exist
                        const otherPending = await tx.waitlistOffer.count({
                            where: {
                                waitlistEntryId: offer.waitlistEntryId,
                                status: "PENDING",
                            },
                        });

                        if (otherPending === 0) {
                            await tx.waitlistEntry.updateMany({
                                where: {
                                    id: offer.waitlistEntryId,
                                    status: "OFFERED",
                                },
                                data: { status: "ACTIVE" },
                            });
                        }

                        return true;
                    }

                    return false;
                });

                if (claimed) {
                    expiredOffersCount++;
                    this.logger.log(`[WaitlistJanitor] Expired waitlist offer ${offer.id}`);
                }
            }

            // 2. Cleanup expired ACTIVE waitlist entries
            const todayUtc = new Date();
            todayUtc.setUTCHours(0, 0, 0, 0);

            const candidateEntries = await this.prisma.waitlistEntry.findMany({
                where: {
                    status: "ACTIVE",
                    OR: [
                        { expiresAt: { lt: now } },
                        { endWindowDate: { lt: todayUtc } },
                    ],
                },
                select: {
                    id: true,
                    organizationId: true,
                    customerId: true,
                },
                take: 100,
            });

            for (const entry of candidateEntries) {
                const claimed = await this.prisma.$transaction(async (tx) => {
                    const updated = await tx.waitlistEntry.updateMany({
                        where: {
                            id: entry.id,
                            status: "ACTIVE",
                            OR: [
                                { expiresAt: { lt: now } },
                                { endWindowDate: { lt: todayUtc } },
                            ],
                        },
                        data: { status: "EXPIRED" },
                    });

                    if (updated.count > 0) {
                        await tx.outboxEvent.create({
                            data: {
                                organizationId: entry.organizationId,
                                aggregateType: "WaitlistEntry",
                                aggregateId: entry.id,
                                eventType: "waitlist.entry_expired",
                                payload: {
                                    waitlistEntryId: entry.id,
                                    organizationId: entry.organizationId,
                                    customerId: entry.customerId,
                                },
                                status: "PENDING",
                            },
                        });
                        return true;
                    }

                    return false;
                });

                if (claimed) {
                    expiredEntriesCount++;
                    this.logger.log(`[WaitlistJanitor] Expired waitlist entry ${entry.id}`);
                }
            }

            return { expiredOffersCount, expiredEntriesCount };
        } catch (err: any) {
            this.logger.warn(`Waitlist cleanup janitor warning: ${err.message}`);
            return { expiredOffersCount, expiredEntriesCount };
        } finally {
            this.isRunning = false;
        }
    }
}
