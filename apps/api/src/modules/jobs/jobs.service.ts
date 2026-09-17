import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class JobsService {
    constructor(private readonly prisma: PrismaService) { }

    async getFailedJobs(organizationId: string) {
        const [failedOutbox, failedNotifications] = await Promise.all([
            this.prisma.outboxEvent.findMany({
                where: {
                    organizationId,
                    status: { in: ["FAILED", "DEAD_LETTER"] },
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            }),
            this.prisma.notification.findMany({
                where: {
                    organizationId,
                    status: "FAILED",
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            }),
        ]);

        return {
            failedOutboxEvents: failedOutbox,
            failedNotifications: failedNotifications,
            totalFailed: failedOutbox.length + failedNotifications.length,
        };
    }

    async retryOutboxJob(organizationId: string, eventId: string) {
        const event = await this.prisma.outboxEvent.findFirst({
            where: { id: eventId, organizationId },
        });

        if (!event) {
            throw new NotFoundException(`Failed Outbox event ${eventId} not found`);
        }

        return this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
                status: "PENDING",
                attempts: 0,
                workerId: null,
                claimedAt: null,
                leaseExpiresAt: null,
                deadLetteredAt: null,
                availableAt: new Date(),
                lastError: null,
            },
        });
    }

    async retryNotification(organizationId: string, notificationId: string) {
        const notif = await this.prisma.notification.findFirst({
            where: { id: notificationId, organizationId },
        });

        if (!notif) {
            throw new NotFoundException(`Failed Notification ${notificationId} not found`);
        }

        return this.prisma.notification.update({
            where: { id: notif.id },
            data: {
                status: "QUEUED",
                attempts: 0,
                scheduledAt: new Date(),
                lastError: null,
            },
        });
    }
}
