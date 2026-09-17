import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class HoldJanitorService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(HoldJanitorService.name);
    private janitorTimer: NodeJS.Timeout | null = null;
    private isRunning = false;

    constructor(private readonly prisma: PrismaService) { }

    onModuleInit() {
        this.logger.log("Starting BookingHold Expiration Janitor (interval: 10s)...");
        this.janitorTimer = setInterval(() => this.cleanupExpiredHolds(), 10000);
    }

    onModuleDestroy() {
        if (this.janitorTimer) {
            clearInterval(this.janitorTimer);
        }
    }

    /**
     * Atomically cleans up expired active booking holds using transactional conditional updates.
     * Prevents duplicate outbox events and race conditions across multiple worker processes.
     */
    async cleanupExpiredHolds(): Promise<number> {
        if (this.isRunning) return 0;
        this.isRunning = true;

        try {
            const now = new Date();
            const candidateHolds = await this.prisma.bookingHold.findMany({
                where: {
                    status: "ACTIVE",
                    expiresAt: { lt: now },
                },
                select: { id: true, organizationId: true },
                take: 100,
            });

            if (candidateHolds.length === 0) {
                return 0;
            }

            let cleanedCount = 0;

            for (const hold of candidateHolds) {
                const claimed = await this.prisma.$transaction(async (tx) => {
                    // Conditional atomic update: only transitions if status is still ACTIVE and expired
                    const updated = await tx.bookingHold.updateMany({
                        where: {
                            id: hold.id,
                            status: "ACTIVE",
                            expiresAt: { lt: now },
                        },
                        data: { status: "EXPIRED" },
                    });

                    // Only the winning worker process that performed the state transition emits the outbox event
                    if (updated.count > 0) {
                        await tx.outboxEvent.create({
                            data: {
                                organizationId: hold.organizationId,
                                aggregateType: "BookingHold",
                                aggregateId: hold.id,
                                eventType: "booking_hold.expired",
                                payload: { holdId: hold.id, organizationId: hold.organizationId },
                                status: "PENDING",
                            },
                        });
                        return true;
                    }

                    return false;
                });

                if (claimed) {
                    cleanedCount++;
                    this.logger.log(`Cleaned up expired BookingHold ${hold.id}`);

                    // Clean up and cancel any pending payment records outside the database transaction
                    try {
                        const pendingPayments = await this.prisma.paymentRecord.findMany({
                            where: {
                                bookingHoldId: hold.id,
                                status: "PENDING",
                            },
                            include: {
                                organization: true,
                            },
                        });

                        for (const payment of pendingPayments) {
                            const stripeKey = process.env.STRIPE_SECRET_KEY;
                            if (stripeKey && payment.providerPaymentId) {
                                const connectedAccountId = payment.organization?.stripeAccountId;
                                const headers: Record<string, string> = {
                                    Authorization: `Bearer ${stripeKey}`,
                                    "Content-Type": "application/x-www-form-urlencoded",
                                    "Idempotency-Key": `hold_expire_cancel_${payment.id}`,
                                };
                                if (connectedAccountId) {
                                    headers["Stripe-Account"] = connectedAccountId;
                                }

                                const response = await fetch(`https://api.stripe.com/v1/payment_intents/${payment.providerPaymentId}/cancel`, {
                                    method: "POST",
                                    headers,
                                });
                                if (!response.ok) {
                                    this.logger.warn(`Janitor remote Stripe cancellation warning for ${payment.providerPaymentId}: HTTP ${response.status}`);
                                    continue;
                                }
                            }
                            await this.prisma.paymentRecord.update({
                                where: { id: payment.id },
                                data: { status: "CANCELLED", failureReason: "Hold expired without customer completion" },
                            });
                        }
                    } catch (err: any) {
                        this.logger.warn(`Janitor payment cleanup warning for hold ${hold.id}: ${err.message}`);
                    }
                }
            }

            if (cleanedCount > 0) {
                this.logger.log(`Successfully expired and emitted events for ${cleanedCount} BookingHolds.`);
            }

            return cleanedCount;
        } catch (err: any) {
            this.logger.warn(`Hold cleanup janitor warning: ${err.message}`);
            return 0;
        } finally {
            this.isRunning = false;
        }
    }
}
