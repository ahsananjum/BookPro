import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import * as crypto from "crypto";

@Injectable()
export class OptimizerJanitorService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(OptimizerJanitorService.name);
    private intervalTimer: NodeJS.Timeout | null = null;
    private isRunning = false;

    constructor(private readonly prisma: PrismaService) { }

    onModuleInit() {
        this.logger.log("Starting Schedule Optimizer Autonomous Janitor (interval: 60s)...");
        this.intervalTimer = setInterval(() => this.runOptimizerSweep(), 60000);
    }

    onModuleDestroy() {
        if (this.intervalTimer) {
            clearInterval(this.intervalTimer);
        }
    }

    /**
     * Scans organizations with autoOfferEnabled = true and auto-dispatches offers for eligible gaps.
     */
    async runOptimizerSweep(): Promise<{ actionedCount: number }> {
        if (this.isRunning) return { actionedCount: 0 };
        this.isRunning = true;

        let actionedCount = 0;

        try {
            const now = new Date();

            // Find organizations that have autoOfferEnabled active
            const autoOrgs = await this.prisma.organization.findMany({
                where: {
                    autoOfferEnabled: true,
                    archivedAt: null,
                },
                select: { id: true, name: true },
            });

            if (autoOrgs.length === 0) {
                return { actionedCount: 0 };
            }

            for (const org of autoOrgs) {
                // Find active insights with future start time
                const activeInsights = await this.prisma.scheduleInsight.findMany({
                    where: {
                        organizationId: org.id,
                        status: "ACTIVE",
                        startAt: { gt: now },
                    },
                    include: {
                        service: true,
                        location: true,
                        staff: true,
                    },
                    take: 10,
                });

                for (const insight of activeInsights) {
                    const candidateMatches = (insight.candidateMatches as any[]) || [];
                    if (candidateMatches.length === 0) continue;

                    const topMatch = candidateMatches[0];
                    if (!topMatch || topMatch.totalScore < 70) continue;

                    try {
                        // Check if entry is still active
                        const entry = await this.prisma.waitlistEntry.findFirst({
                            where: { id: topMatch.waitlistEntryId, organizationId: org.id, status: "ACTIVE" },
                            include: { customer: true, service: true },
                        });

                        if (!entry) continue;

                        // Check for conflicting confirmed appointments or active holds
                        const conflictingAppts = await this.prisma.appointment.count({
                            where: {
                                organizationId: org.id,
                                locationId: insight.locationId,
                                staffId: insight.staffId || undefined,
                                status: { in: ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] },
                                startAt: { lt: insight.endAt },
                                endAt: { gt: insight.startAt },
                            },
                        });

                        if (conflictingAppts > 0) {
                            await this.prisma.scheduleInsight.update({
                                where: { id: insight.id },
                                data: { status: "STALE", staleAt: new Date() },
                            });
                            continue;
                        }

                        const conflictingHolds = await this.prisma.bookingHold.count({
                            where: {
                                organizationId: org.id,
                                locationId: insight.locationId,
                                staffId: insight.staffId || undefined,
                                status: "ACTIVE",
                                expiresAt: { gt: now },
                                startAt: { lt: insight.endAt },
                                endAt: { gt: insight.startAt },
                            },
                        });

                        if (conflictingHolds > 0) continue;

                        // Create high-entropy token and authoritatively lock the slot
                        const token = crypto.randomBytes(32).toString("hex");
                        const expiryMinutes = 60;
                        const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

                        await this.prisma.$transaction(async (tx) => {
                            const hold = await tx.bookingHold.create({
                                data: {
                                    organizationId: org.id,
                                    locationId: insight.locationId,
                                    serviceId: insight.serviceId || entry.serviceId,
                                    staffId: insight.staffId,
                                    customerId: entry.customerId,
                                    startAt: insight.startAt,
                                    endAt: insight.endAt,
                                    partySize: entry.partySize || 1,
                                    status: "ACTIVE",
                                    expiresAt,
                                    quoteSnapshot: {
                                        totalCents: entry.service.priceCents || 0,
                                        depositCents: 0,
                                        currency: entry.service.currency || "USD",
                                    },
                                },
                            });

                            const offer = await tx.waitlistOffer.create({
                                data: {
                                    organizationId: org.id,
                                    waitlistEntryId: entry.id,
                                    serviceId: insight.serviceId || entry.serviceId,
                                    locationId: insight.locationId,
                                    staffId: insight.staffId,
                                    startAt: insight.startAt,
                                    endAt: insight.endAt,
                                    token,
                                    status: "PENDING",
                                    score: topMatch.totalScore,
                                    bookingHoldId: hold.id,
                                    scheduleInsightId: insight.id,
                                    expiresAt,
                                },
                            });

                            await tx.waitlistEntry.update({
                                where: { id: entry.id },
                                data: { status: "OFFERED" },
                            });

                            await tx.scheduleInsight.update({
                                where: { id: insight.id },
                                data: {
                                    status: "ACTIONED",
                                    actionedAt: new Date(),
                                    actionedOfferId: offer.id,
                                },
                            });

                            await tx.outboxEvent.create({
                                data: {
                                    organizationId: org.id,
                                    aggregateType: "WaitlistOffer",
                                    aggregateId: offer.id,
                                    eventType: "waitlist.offer_created",
                                    payload: {
                                        offerId: offer.id,
                                        organizationId: org.id,
                                        waitlistEntryId: entry.id,
                                        customerId: entry.customerId,
                                        customerName: entry.customer?.fullName,
                                        customerEmail: entry.customer?.email,
                                        serviceName: entry.service.name,
                                        startAt: insight.startAt.toISOString(),
                                        endAt: insight.endAt.toISOString(),
                                        expiresAt: expiresAt.toISOString(),
                                        claimToken: token,
                                        claimUrl: `/offers/${token}`,
                                    },
                                    status: "PENDING",
                                },
                            });
                        });

                        actionedCount++;
                        this.logger.log(
                            `[OptimizerJanitor] Auto-actioned insight ${insight.id} -> dispatched offer to waitlist entry ${entry.id}`
                        );
                    } catch (err: any) {
                        this.logger.warn(`[OptimizerJanitor] Failed to action insight ${insight.id}: ${err.message}`);
                    }
                }
            }

            return { actionedCount };
        } catch (err: any) {
            this.logger.warn(`Schedule optimizer janitor warning: ${err.message}`);
            return { actionedCount };
        } finally {
            this.isRunning = false;
        }
    }
}
