import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class CronService {
    private readonly logger = new Logger(CronService.name);
    private isRunning = false;

    constructor(private readonly prisma: PrismaService) { }

    async runAll() {
        if (this.isRunning) {
            return { skipped: true, reason: "Already running" };
        }
        this.isRunning = true;

        try {
            this.logger.log("Executing scheduled worker cron cycle on Vercel...");
            const now = new Date();

            // 1. Cleanup expired active booking holds
            const expiredHolds = await this.prisma.bookingHold.findMany({
                where: { status: "ACTIVE", expiresAt: { lt: now } },
                select: { id: true, organizationId: true },
                take: 50,
            });

            let cleanedHolds = 0;
            for (const hold of expiredHolds) {
                const claimed = await this.prisma.$transaction(async (tx) => {
                    const res = await tx.bookingHold.updateMany({
                        where: { id: hold.id, status: "ACTIVE", expiresAt: { lt: now } },
                        data: { status: "EXPIRED" },
                    });

                    if (res.count > 0) {
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
                    cleanedHolds++;
                }
            }

            // 2. Cleanup expired waitlist offers
            const expiredOffers = await this.prisma.waitlistOffer.updateMany({
                where: { status: "PENDING", expiresAt: { lt: now } },
                data: { status: "EXPIRED" },
            });

            // 3. Purge expired idempotency records
            const expiredIdempotency = await this.prisma.idempotencyRecord.deleteMany({
                where: { expiresAt: { lt: now } },
            });

            // 4. Process appointment lifecycle transitions
            const autoStarted = await this.prisma.appointment.updateMany({
                where: { status: "CHECKED_IN", startAt: { lte: now } },
                data: { status: "IN_PROGRESS" },
            });

            const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
            const autoCompleted = await this.prisma.appointment.updateMany({
                where: { status: "IN_PROGRESS", endAt: { lte: tenMinutesAgo } },
                data: { status: "COMPLETED" },
            });

            // 5. Process pending outbox events
            const pendingEvents = await this.prisma.outboxEvent.findMany({
                where: { status: "PENDING", availableAt: { lte: now } },
                take: 25,
                orderBy: { createdAt: "asc" },
            });

            let dispatchedOutbox = 0;
            for (const event of pendingEvents) {
                await this.prisma.outboxEvent.update({
                    where: { id: event.id },
                    data: {
                        status: "DISPATCHED",
                        processedAt: new Date(),
                    },
                });
                dispatchedOutbox++;
            }

            return {
                cleanedHolds,
                expiredOffersCount: expiredOffers.count,
                purgedIdempotencyCount: expiredIdempotency.count,
                appointmentsStarted: autoStarted.count,
                appointmentsCompleted: autoCompleted.count,
                dispatchedOutbox,
            };
        } finally {
            this.isRunning = false;
        }
    }
}
