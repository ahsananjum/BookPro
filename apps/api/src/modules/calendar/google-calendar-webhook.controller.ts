import { Controller, Post, Headers, HttpCode, HttpStatus, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../database/prisma.service";
import { OutboxService } from "../outbox/outbox.service";
import { Public } from "@bookpro/server-core";

@Controller("webhooks/google-calendar")
export class GoogleCalendarWebhookController {
    private readonly logger = new Logger(GoogleCalendarWebhookController.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly outboxService: OutboxService,
    ) { }

    @Public()
    @Post()
    @HttpCode(HttpStatus.OK)
    async handleGoogleCalendarPushNotification(
        @Headers("x-goog-channel-id") channelId?: string,
        @Headers("x-goog-resource-id") resourceId?: string,
        @Headers("x-goog-resource-state") resourceState?: string,
        @Headers("x-goog-message-number") messageNumber?: string,
        @Headers("x-goog-channel-token") channelToken?: string,
    ) {
        this.logger.log(
            `[GoogleWebhook] Received Push Notification: Channel=${channelId}, Resource=${resourceId}, State=${resourceState}, Msg#=${messageNumber}`
        );

        if (!channelId || !resourceId || !channelToken || !messageNumber || !/^\d+$/.test(messageNumber)) {
            return { received: true, ignored: true, reason: "Missing channelId" };
        }

        // 2. Lookup corresponding GoogleCalendarConnection
        const connection = await this.prisma.googleCalendarConnection.findFirst({
            where: { channelId, resourceId, channelExpiration: { gt: new Date() } },
        });

        if (!connection) {
            this.logger.warn(`[GoogleWebhook] No connection found for channel ${channelId}. Acknowledging cleanly.`);
            return { received: true, ignored: true, reason: "Unknown channel" };
        }

        if (!connection.channelTokenHash || !this.safeHashEqual(channelToken, connection.channelTokenHash)) {
            return { received: true, ignored: true, reason: "Invalid channel metadata" };
        }
        const incoming = BigInt(messageNumber);
        const advanced = await this.prisma.googleCalendarConnection.updateMany({
            where: { id: connection.id, OR: [{ lastMessageNumber: null }, { lastMessageNumber: { lt: incoming } }] },
            data: { lastMessageNumber: incoming },
        });
        if (advanced.count !== 1) return { received: true, ignored: true, reason: "Duplicate or out-of-order message" };
        if (resourceState === "sync") return { received: true, state: "sync" };

        // 3. Fast Durable Asynchronous Trigger via Outbox (Architecture §76 / PRD §74)
        await this.outboxService.emit({
            organizationId: connection.organizationId,
            aggregateType: "GoogleCalendarConnection",
            aggregateId: connection.id,
            eventType: "calendar.inbound_sync_requested",
            payload: {
                organizationId: connection.organizationId,
                staffId: connection.staffId,
                connectionId: connection.id,
                channelId,
                resourceId,
                resourceState,
                reason: "WEBHOOK",
            },
        });

        return { received: true, queued: true };
    }

    private safeHashEqual(token: string, expectedHex: string): boolean {
        const supplied = crypto.createHash("sha256").update(token, "utf8").digest();
        const expected = Buffer.from(expectedHex, "hex");
        return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    }
}
