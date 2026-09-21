import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { GoogleCalendarAdapter, EncryptionService } from "@bookpro/server-core";

@Injectable()
export class CronService {
    private readonly logger = new Logger(CronService.name);
    private isRunning = false;
    private readonly calendarAdapter = new GoogleCalendarAdapter();

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

            // 5. Process and dispatch pending outbox events (Email, Calendar Sync, etc.)
            const dispatchedOutbox = await this.processPendingOutbox(now);

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

    /**
     * Atomically claims and dispatches pending Outbox events (Email delivery via Brevo & Google Calendar sync)
     */
    async processPendingOutbox(now = new Date(), limit = 25): Promise<number> {
        const pendingEvents = await this.prisma.outboxEvent.findMany({
            where: { status: "PENDING", availableAt: { lte: now } },
            take: limit,
            orderBy: { createdAt: "asc" },
        });

        if (!pendingEvents.length) return 0;

        let dispatchedCount = 0;
        for (const event of pendingEvents) {
            try {
                await this.processSingleOutboxEvent(event);
                await this.prisma.outboxEvent.update({
                    where: { id: event.id },
                    data: {
                        status: "PROCESSED",
                        processedAt: new Date(),
                        publishedAt: new Date(),
                    },
                });
                dispatchedCount++;
            } catch (err: any) {
                this.logger.error(`Error processing outbox event ${event.id} [${event.eventType}]: ${err.message}`, err.stack);
                await this.prisma.outboxEvent.update({
                    where: { id: event.id },
                    data: {
                        attempts: { increment: 1 },
                        lastError: err.message,
                    },
                });
            }
        }

        return dispatchedCount;
    }

    private async processSingleOutboxEvent(event: any): Promise<void> {
        const payload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;

        switch (event.eventType) {
            case "appointment.created":
            case "appointment.confirmed": {
                const appointmentId = payload.appointmentId || payload.id;
                const appt = await this.prisma.appointment.findUnique({
                    where: { id: appointmentId },
                    include: { customer: true, staff: true, service: true, location: true, organization: true },
                });

                if (!appt) {
                    this.logger.warn(`Appointment ${appointmentId} not found for outbox event ${event.id}`);
                    return;
                }

                // 1. Send Email via Brevo
                if (appt.customer?.email) {
                    await this.dispatchBookingConfirmationEmail(appt, event.eventType);
                }

                // 2. Outbound Google Calendar Sync
                if (appt.staffId) {
                    await this.syncToGoogleCalendar(appt);
                }
                break;
            }

            case "appointment.cancelled": {
                const appointmentId = payload.appointmentId || payload.id;
                const appt = await this.prisma.appointment.findUnique({
                    where: { id: appointmentId },
                    include: { customer: true, staff: true, service: true, location: true, organization: true },
                });
                if (appt && appt.customer?.email) {
                    await this.dispatchCancellationEmail(appt);
                }
                break;
            }

            default:
                this.logger.debug(`Outbox event ${event.eventType} has no custom email/calendar handler.`);
                break;
        }
    }

    private async dispatchBookingConfirmationEmail(appt: any, eventType: string): Promise<void> {
        const studioName = appt.organization?.brandName || appt.organization?.name || "BookPro";
        const serviceName = appt.service?.name || "Service";
        const staffName = appt.staff?.displayName || "Our Team";
        const locationName = appt.location?.name || "Main Location";
        const locationAddress = appt.location?.address || "";
        const customerName = appt.customer?.fullName || "Valued Guest";
        const durationMin = appt.service?.durationMin || 60;
        const priceFormatted = new Intl.NumberFormat("en-US", { style: "currency", currency: appt.currency || "USD" }).format(appt.priceCents / 100);
        const startFormatted = new Date(appt.startAt).toLocaleString("en-US", {
            timeZone: appt.location?.timezone || "UTC",
            dateStyle: "full",
            timeStyle: "short",
        });

        const subject = `Appointment Confirmed: ${serviceName} with ${studioName}`;
        const htmlBody = `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                <div style="border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px;">
                    <h2 style="color: #0f172a; margin: 0;">${studioName}</h2>
                    <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">${locationAddress}</p>
                </div>
                <p style="font-size: 16px;">Hello <strong>${customerName}</strong>,</p>
                <p>Your appointment has been successfully confirmed!</p>
                <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 16px; margin: 20px 0; border-radius: 4px;">
                    <p style="margin: 4px 0;"><strong>Service:</strong> ${serviceName}</p>
                    <p style="margin: 4px 0;"><strong>Date & Time:</strong> ${startFormatted} (${durationMin} min)</p>
                    <p style="margin: 4px 0;"><strong>Staff / Specialist:</strong> ${staffName}</p>
                    <p style="margin: 4px 0;"><strong>Location:</strong> ${locationName} - ${locationAddress}</p>
                    <p style="margin: 4px 0;"><strong>Total / Deposit:</strong> ${priceFormatted}</p>
                </div>
                <p style="font-size: 13px; color: #64748b;">Need to make changes? You can reschedule or cancel according to our policy terms online.</p>
            </div>
        `;
        const textBody = `Hello ${customerName},\n\nYour appointment for ${serviceName} with ${studioName} is confirmed for ${startFormatted}.\nStaff: ${staffName}\nLocation: ${locationName} (${locationAddress})\nTotal: ${priceFormatted}\n\nThank you for choosing ${studioName}!`;

        const dedupeKey = `notif:confirm:${appt.id}:${appt.customer.email}`;
        let messageId: string | null = null;

        try {
            messageId = await this.sendBrevoEmail(appt.customer.email, subject, htmlBody, textBody, studioName);
        } catch (mailErr: any) {
            this.logger.warn(`Brevo email dispatch failed for appointment ${appt.id}: ${mailErr.message}`);
        }

        // Upsert Notification record so complete page immediately recognizes delivery
        await this.prisma.notification.upsert({
            where: { dedupeKey },
            create: {
                organizationId: appt.organizationId,
                recipient: appt.customer.email,
                channel: "EMAIL",
                eventType,
                templateName: "booking_confirmation",
                status: messageId ? "SENT" : "FAILED",
                providerId: messageId,
                sentAt: messageId ? new Date() : null,
                lastError: messageId ? null : "Failed to dispatch via Brevo",
                appointmentId: appt.id,
                customerId: appt.customerId,
                dedupeKey,
                variables: {
                    customerName,
                    serviceName,
                    studioName,
                    staffName,
                    locationName,
                    locationAddress,
                    startFormatted,
                    durationMin,
                    priceFormatted,
                    appointmentVersion: appt.version,
                },
            },
            update: {
                status: messageId ? "SENT" : "FAILED",
                providerId: messageId,
                sentAt: messageId ? new Date() : null,
            },
        });
    }

    private async dispatchCancellationEmail(appt: any): Promise<void> {
        const studioName = appt.organization?.brandName || appt.organization?.name || "BookPro";
        const serviceName = appt.service?.name || "Service";
        const customerName = appt.customer?.fullName || "Valued Guest";
        const subject = `Appointment Cancelled: ${serviceName} with ${studioName}`;
        const htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #ef4444; margin: 0 0 16px 0;">Appointment Cancelled</h2>
                <p>Hello <strong>${customerName}</strong>,</p>
                <p>Your appointment for <strong>${serviceName}</strong> with <strong>${studioName}</strong> has been cancelled.</p>
            </div>
        `;
        const textBody = `Hello ${customerName},\n\nYour appointment for ${serviceName} with ${studioName} has been cancelled.`;

        await this.sendBrevoEmail(appt.customer.email, subject, htmlBody, textBody, studioName);
    }

    private async syncToGoogleCalendar(appt: any): Promise<void> {
        const connection = await this.prisma.googleCalendarConnection.findUnique({
            where: {
                organizationId_staffId_provider: {
                    organizationId: appt.organizationId,
                    staffId: appt.staffId,
                    provider: "GOOGLE",
                },
            },
        });

        if (!connection || connection.status === "DISCONNECTED") return;

        try {
            const accessToken = await this.getValidAccessToken(connection);
            const calendarId = connection.selectedCalendarId || "primary";
            const summary = `${appt.service?.name || "Appointment"} - ${appt.customer?.fullName || "Client"}`;
            const description = `BookPro Confirmed Booking\nService: ${appt.service?.name}\nCustomer: ${appt.customer?.fullName} (${appt.customer?.email})\nAppointment ID: ${appt.id}`;

            const googleEvent = await this.calendarAdapter.createEvent(accessToken, calendarId, {
                summary,
                description,
                location: appt.location ? `${appt.location.name}, ${appt.location.address || ""}` : undefined,
                start: { dateTime: appt.startAt.toISOString(), timeZone: appt.location?.timezone || "UTC" },
                end: { dateTime: appt.endAt.toISOString(), timeZone: appt.location?.timezone || "UTC" },
                attendees: appt.customer?.email ? [{ email: appt.customer.email, displayName: appt.customer.fullName || undefined, responseStatus: "accepted" }] : undefined,
            });

            await this.prisma.externalCalendarEvent.upsert({
                where: { connectionId_providerEventId: { connectionId: connection.id, providerEventId: googleEvent.id } },
                create: {
                    organizationId: appt.organizationId,
                    staffId: appt.staffId,
                    connectionId: connection.id,
                    providerEventId: googleEvent.id,
                    calendarId,
                    appointmentId: appt.id,
                    title: summary,
                    startAt: appt.startAt,
                    endAt: appt.endAt,
                    isAllDay: false,
                    isBusy: false,
                    etag: googleEvent.etag,
                    status: "CONFIRMED",
                    version: appt.version,
                    lastSyncedAt: new Date(),
                },
                update: {
                    appointmentId: appt.id,
                    startAt: appt.startAt,
                    endAt: appt.endAt,
                    etag: googleEvent.etag,
                    status: "CONFIRMED",
                    version: appt.version,
                    lastSyncedAt: new Date(),
                },
            });

            await this.prisma.googleCalendarConnection.update({
                where: { id: connection.id },
                data: { status: "CONNECTED", lastSuccessAt: new Date(), lastError: null },
            });
            this.logger.log(`Pushed appointment ${appt.id} to Google Calendar event ${googleEvent.id}`);
        } catch (err: any) {
            const isInvalidGrant = err.message?.includes("invalid_grant");
            this.logger.warn(`Google Calendar sync error for appointment ${appt.id}: ${err.message}`);
            await this.prisma.googleCalendarConnection.update({
                where: { id: connection.id },
                data: {
                    status: isInvalidGrant ? "ACTION_REQUIRED" : "DEGRADED",
                    lastError: `Outbound push error: ${err.message}`,
                },
            });
        }
    }

    private async getValidAccessToken(connection: any): Promise<string> {
        const now = new Date();
        const bufferMs = 60 * 1000;

        if (
            connection.encryptedAccessToken &&
            connection.accessTokenExpiresAt &&
            new Date(connection.accessTokenExpiresAt).getTime() > now.getTime() + bufferMs
        ) {
            return EncryptionService.decrypt(connection.encryptedAccessToken);
        }

        const rawRefreshToken = EncryptionService.decrypt(connection.encryptedRefreshToken);
        const { accessToken, expiresIn } = await this.calendarAdapter.refreshAccessToken(rawRefreshToken);
        const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

        await this.prisma.googleCalendarConnection.update({
            where: { id: connection.id },
            data: {
                encryptedAccessToken: EncryptionService.encrypt(accessToken),
                accessTokenExpiresAt: newExpiresAt,
                status: "CONNECTED",
                lastError: null,
            },
        });

        return accessToken;
    }

    private async sendBrevoEmail(to: string, subject: string, htmlContent: string, textContent: string, senderName = "BookPro"): Promise<string | null> {
        const apiKey = process.env.BREVO_API_KEY;
        const senderRaw = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || "ahsananjum170@gmail.com";
        if (!apiKey) {
            this.logger.warn("Brevo API key not configured. Skipping email dispatch.");
            return null;
        }

        const cleanSender = senderRaw.includes("<") ? senderRaw.split("<")[1].replace(">", "").trim() : senderRaw.trim();
        this.logger.log(`Dispatching transactional email via Brevo to ${to}...`);

        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "api-key": apiKey,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            body: JSON.stringify({
                sender: { name: senderName, email: cleanSender },
                to: [{ email: to }],
                subject,
                htmlContent,
                textContent,
                tags: ["bookpro-transactional"],
            }),
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Brevo API error (${response.status}): ${errText}`);
        }

        const data: any = await response.json();
        this.logger.log(`Brevo email dispatched successfully (Message ID: ${data.messageId})`);
        return data.messageId || null;
    }
}
