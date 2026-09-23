import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { OutboxService } from "../outbox/outbox.service";
import { GoogleCalendarAdapter, EncryptionService } from "@bookpro/server-core";

@Injectable()
export class CronService implements OnModuleInit {
    private readonly logger = new Logger(CronService.name);
    private isRunning = false;
    private readonly calendarAdapter = new GoogleCalendarAdapter();

    constructor(
        private readonly prisma: PrismaService,
        private readonly outboxService: OutboxService,
    ) { }

    onModuleInit() {
        this.outboxService.registerProcessor(() => this.processPendingOutbox(new Date(), 25));
        this.logger.log("CronService initialized: registered immediate outbox processor.");
    }

    async runAll() {
        if (this.isRunning) {
            return { skipped: true, reason: "Already running" };
        }
        this.isRunning = true;

        try {
            this.logger.log("Executing scheduled worker cron cycle on Vercel...");
            const now = new Date();

            // 1. Cleanup expired active booking holds & cancel pending Stripe payment intents
            const cleanedHolds = await this.cleanupExpiredHolds(now);

            // 2. Cleanup expired waitlist offers and cascade offers
            const expiredOffersCount = await this.cleanupExpiredWaitlistOffers(now);

            // 3. Cleanup expired waitlist entries
            const expiredEntriesCount = await this.cleanupExpiredWaitlistEntries(now);

            // 4. Purge expired idempotency records
            const expiredIdempotency = await this.prisma.idempotencyRecord.deleteMany({
                where: { expiresAt: { lt: now } },
            });

            // 5. Process appointment lifecycle transitions (Auto-start, Auto-complete, Auto-no-show)
            const lifecycleResults = await this.processAppointmentLifecycle(now);

            // 6. Poll and dispatch scheduled reminders (e.g. 1h and 24h reminders)
            const dispatchedReminders = await this.pollScheduledReminders(now);

            // 7. Process and dispatch pending outbox events (Email, Calendar Sync, etc.)
            const dispatchedOutbox = await this.processPendingOutbox(now, 50);

            return {
                cleanedHolds,
                expiredOffersCount,
                expiredEntriesCount,
                purgedIdempotencyCount: expiredIdempotency.count,
                appointmentsStarted: lifecycleResults.started,
                appointmentsCompleted: lifecycleResults.completed,
                appointmentsNoShow: lifecycleResults.noShow,
                dispatchedReminders,
                dispatchedOutbox,
            };
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Atomically expires booking holds and cancels orphaned Stripe PaymentIntents
     */
    private async cleanupExpiredHolds(now: Date): Promise<number> {
        const expiredHolds = await this.prisma.bookingHold.findMany({
            where: { status: "ACTIVE", expiresAt: { lt: now } },
            select: { id: true, organizationId: true },
            take: 50,
        });

        let cleaned = 0;
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
                cleaned++;
                // Remote Stripe payment intent cancellation
                try {
                    const pendingPayments = await this.prisma.paymentRecord.findMany({
                        where: { bookingHoldId: hold.id, status: "PENDING" },
                        include: { organization: true },
                    });

                    const stripeKey = process.env.STRIPE_SECRET_KEY;
                    for (const payment of pendingPayments) {
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

                            await fetch(`https://api.stripe.com/v1/payment_intents/${payment.providerPaymentId}/cancel`, {
                                method: "POST",
                                headers,
                            }).catch(() => null);
                        }

                        await this.prisma.paymentRecord.update({
                            where: { id: payment.id },
                            data: { status: "CANCELLED", failureReason: "Hold expired without customer completion" },
                        });
                    }
                } catch (err: any) {
                    this.logger.warn(`Stripe cleanup error for hold ${hold.id}: ${err.message}`);
                }
            }
        }
        return cleaned;
    }

    /**
     * Atomically expires unclaimed waitlist offers, releases hold, and reverts entry
     */
    private async cleanupExpiredWaitlistOffers(now: Date): Promise<number> {
        const candidateOffers = await this.prisma.waitlistOffer.findMany({
            where: { status: "PENDING", expiresAt: { lt: now } },
            select: { id: true, waitlistEntryId: true, organizationId: true, bookingHoldId: true },
            take: 50,
        });

        let expiredCount = 0;
        for (const offer of candidateOffers) {
            const claimed = await this.prisma.$transaction(async (tx) => {
                const res = await tx.waitlistOffer.updateMany({
                    where: { id: offer.id, status: "PENDING", expiresAt: { lt: now } },
                    data: { status: "EXPIRED" },
                });

                if (res.count > 0) {
                    if (offer.bookingHoldId) {
                        await tx.bookingHold.updateMany({
                            where: { id: offer.bookingHoldId, status: "ACTIVE" },
                            data: { status: "RELEASED" },
                        });
                    }

                    await tx.outboxEvent.create({
                        data: {
                            organizationId: offer.organizationId,
                            aggregateType: "WaitlistOffer",
                            aggregateId: offer.id,
                            eventType: "waitlist.offer_expired",
                            payload: { offerId: offer.id, waitlistEntryId: offer.waitlistEntryId, organizationId: offer.organizationId },
                            status: "PENDING",
                        },
                    });

                    const otherPending = await tx.waitlistOffer.count({
                        where: { waitlistEntryId: offer.waitlistEntryId, status: "PENDING" },
                    });

                    if (otherPending === 0) {
                        await tx.waitlistEntry.updateMany({
                            where: { id: offer.waitlistEntryId, status: "OFFERED" },
                            data: { status: "ACTIVE" },
                        });
                    }
                    return true;
                }
                return false;
            });

            if (claimed) expiredCount++;
        }
        return expiredCount;
    }

    /**
     * Expires waitlist entries past their validity window
     */
    private async cleanupExpiredWaitlistEntries(now: Date): Promise<number> {
        const todayUtc = new Date();
        todayUtc.setUTCHours(0, 0, 0, 0);

        const result = await this.prisma.waitlistEntry.updateMany({
            where: {
                status: "ACTIVE",
                OR: [
                    { expiresAt: { lt: now } },
                    { endWindowDate: { lt: todayUtc } },
                ],
            },
            data: { status: "EXPIRED" },
        });

        return result.count;
    }

    /**
     * Executes automatic lifecycle transitions:
     * 1. Auto-Start: CHECKED_IN where startAt <= now -> IN_PROGRESS
     * 2. Auto-Complete: IN_PROGRESS where endAt <= now - 10m -> COMPLETED
     * 3. Auto-No-Show: CONFIRMED where startAt <= now - 30m -> NO_SHOW
     */
    private async processAppointmentLifecycle(now: Date): Promise<{ started: number; completed: number; noShow: number }> {
        const autoStarted = await this.prisma.appointment.updateMany({
            where: { status: "CHECKED_IN", startAt: { lte: now } },
            data: { status: "IN_PROGRESS" },
        });

        const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
        const autoCompleted = await this.prisma.appointment.updateMany({
            where: { status: "IN_PROGRESS", endAt: { lte: tenMinutesAgo } },
            data: { status: "COMPLETED" },
        });

        const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
        const autoNoShow = await this.prisma.appointment.updateMany({
            where: { status: "CONFIRMED", startAt: { lte: thirtyMinutesAgo } },
            data: { status: "NO_SHOW" },
        });

        return {
            started: autoStarted.count,
            completed: autoCompleted.count,
            noShow: autoNoShow.count,
        };
    }

    /**
     * Polls and dispatches scheduled notifications (e.g. 1h and 24h reminders)
     */
    async pollScheduledReminders(now = new Date()): Promise<number> {
        const queued = await this.prisma.notification.findMany({
            where: {
                status: "QUEUED",
                scheduledAt: { lte: now },
            },
            take: 25,
        });

        let sent = 0;
        for (const notif of queued) {
            try {
                const vars: any = notif.variables || {};
                const subject = `Upcoming Appointment Reminder: ${vars.serviceName || "Appointment"} with ${vars.studioName || "BookPro"}`;
                const htmlBody = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                        <h2 style="color: #0284c7; margin: 0 0 16px 0;">Appointment Reminder</h2>
                        <p>Hello <strong>${vars.customerName || "Valued Guest"}</strong>,</p>
                        <p>This is a reminder for your upcoming appointment:</p>
                        <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 16px; margin: 20px 0; border-radius: 4px;">
                            <p style="margin: 4px 0;"><strong>Service:</strong> ${vars.serviceName || "Service"}</p>
                            <p style="margin: 4px 0;"><strong>Time:</strong> ${vars.startFormatted || "Scheduled time"}</p>
                            <p style="margin: 4px 0;"><strong>Staff:</strong> ${vars.staffName || "Our Team"}</p>
                            <p style="margin: 4px 0;"><strong>Location:</strong> ${vars.locationName || "Location"} ${vars.locationAddress ? `- ${vars.locationAddress}` : ""}</p>
                        </div>
                    </div>
                `;
                const textBody = `Reminder: Your appointment for ${vars.serviceName || "Service"} with ${vars.studioName || "BookPro"} is at ${vars.startFormatted || "scheduled time"}.`;
                const messageId = await this.sendBrevoEmail(notif.recipient, subject, htmlBody, textBody, vars.studioName || "BookPro");
                await this.prisma.notification.update({
                    where: { id: notif.id },
                    data: {
                        status: messageId ? "SENT" : "FAILED",
                        sentAt: messageId ? new Date() : null,
                        providerId: messageId,
                    },
                });
                if (messageId) sent++;
            } catch (err: any) {
                this.logger.warn(`Failed to dispatch scheduled reminder ${notif.id}: ${err.message}`);
                await this.prisma.notification.update({
                    where: { id: notif.id },
                    data: { status: "FAILED", lastError: err.message },
                });
            }
        }
        return sent;
    }

    /**
     * Claims and dispatches pending Outbox events with retries and dead-letter handling
     */
    async processPendingOutbox(now = new Date(), limit = 50): Promise<number> {
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
                const attempts = (event.attempts || 0) + 1;
                const isMax = attempts >= 5;

                await this.prisma.outboxEvent.update({
                    where: { id: event.id },
                    data: {
                        attempts: { increment: 1 },
                        lastError: err.message,
                        status: isMax ? "DEAD_LETTER" : "PENDING",
                        deadLetteredAt: isMax ? new Date() : null,
                        availableAt: isMax ? now : new Date(Date.now() + Math.min(5000 * Math.pow(2, attempts - 1), 300000)),
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

                // 1. Send Booking Confirmation Email
                if (appt.customer?.email) {
                    await this.dispatchBookingConfirmationEmail(appt, event.eventType);
                }

                // 2. Schedule 1-Hour Reminder Intent
                if (appt.customer?.email) {
                    const oneHourBefore = new Date(new Date(appt.startAt).getTime() - 60 * 60 * 1000);
                    if (oneHourBefore > new Date()) {
                        const reminderDedupeKey = `notif:reminder:v${appt.version}:${appt.id}:${appt.customer.email}`;
                        await this.prisma.notification.upsert({
                            where: { dedupeKey: reminderDedupeKey },
                            create: {
                                organizationId: appt.organizationId,
                                recipient: appt.customer.email,
                                channel: "EMAIL",
                                eventType: "appointment.reminder",
                                templateName: "appointment_reminder",
                                status: "QUEUED",
                                scheduledAt: oneHourBefore,
                                appointmentId: appt.id,
                                customerId: appt.customerId,
                                dedupeKey: reminderDedupeKey,
                                variables: {
                                    customerName: appt.customer.fullName || "Valued Guest",
                                    serviceName: appt.service?.name || "Service",
                                    studioName: appt.organization?.name || "BookPro",
                                    staffName: appt.staff?.displayName || "Our Team",
                                    locationName: appt.location?.name || "Main Location",
                                    locationAddress: appt.location?.address || "",
                                    startFormatted: new Date(appt.startAt).toLocaleString("en-US", {
                                        timeZone: appt.location?.timezone || "UTC",
                                        dateStyle: "full",
                                        timeStyle: "short",
                                    }),
                                },
                            },
                            update: {},
                        });
                    }
                }

                // 3. Outbound Google Calendar Sync
                if (appt.staffId) {
                    await this.syncToGoogleCalendar(appt);
                }
                break;
            }

            case "appointment.rescheduled": {
                const appointmentId = payload.appointmentId || payload.id;
                const appt = await this.prisma.appointment.findUnique({
                    where: { id: appointmentId },
                    include: { customer: true, staff: true, service: true, location: true, organization: true },
                });

                if (appt) {
                    if (appt.customer?.email) {
                        await this.dispatchRescheduledEmail(appt);
                    }
                    if (appt.staffId) {
                        await this.syncToGoogleCalendar(appt);
                    }
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

            case "identity.email_verification_requested": {
                await this.dispatchEmailVerification(payload);
                break;
            }

            case "identity.staff_invitation_requested": {
                await this.dispatchStaffInvitation(payload);
                break;
            }

            case "identity.customer_invitation_requested": {
                await this.dispatchCustomerInvitation(payload);
                break;
            }

            case "waitlist_offer.created": {
                await this.dispatchWaitlistOfferEmail(payload);
                break;
            }

            case "marketing.campaign_recipient_requested": {
                if (payload.recipientEmail) {
                    await this.sendBrevoEmail(
                        payload.recipientEmail,
                        payload.subject || "Special Update from BookPro",
                        payload.htmlBody || `<p>${payload.textBody || ""}</p>`,
                        payload.textBody || "",
                        payload.studioName || "BookPro",
                    );
                }
                break;
            }

            default:
                this.logger.debug(`Outbox event ${event.eventType} has no custom handler.`);
                break;
        }
    }

    private async dispatchEmailVerification(payload: any): Promise<void> {
        const fullName = payload.fullName || "Valued User";
        const code = payload.verificationCode;
        const recipient = payload.recipientEmail;
        const subject = "Complete your BookPro registration";
        const htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: auto; padding: 32px; background: #0b1428; color: #eaf2ff; border-radius: 16px;">
                <h1 style="color: #ffffff; font-size: 24px; margin-top: 0;">Confirm your email</h1>
                <p style="color: #a8b5ca; line-height: 1.6;">Hello ${fullName}, enter this verification code in BookPro to confirm your email address:</p>
                <div style="margin: 24px 0; padding: 20px; background: #071021; border: 1px solid #1e749c; border-radius: 12px; text-align: center;">
                    <div style="color: #7dd3fc; font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 4px;">${code}</div>
                    <div style="color: #7888a3; font-size: 12px; margin-top: 8px;">Expires in 15 minutes</div>
                </div>
                <p style="color: #7888a3; font-size: 12px;">If you did not register for BookPro, you can safely ignore this email.</p>
            </div>
        `;
        const textBody = `Hello ${fullName},\n\nYour BookPro email verification code is: ${code}\nExpires in 15 minutes.`;
        await this.sendBrevoEmail(recipient, subject, htmlBody, textBody, "BookPro Security");
    }

    private async dispatchStaffInvitation(payload: any): Promise<void> {
        const rawToken = EncryptionService.decrypt(payload.encryptedInvitationToken);
        const webUrl = (process.env.WEB_URL || "https://bookpro-fawn.vercel.app").replace(/\/$/, "");
        const invitationUrl = `${webUrl}/invite/accept?token=${encodeURIComponent(rawToken)}`;
        const org = payload.organizationId ? await this.prisma.organization.findUnique({ where: { id: payload.organizationId }, select: { name: true, brandName: true } }) : null;
        const studioName = org?.brandName || org?.name || "BookPro";
        const subject = `You have been invited to join ${studioName} on BookPro`;
        const htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: auto; padding: 32px; background: #0b1428; color: #eaf2ff; border-radius: 16px;">
                <h1 style="color: #ffffff; font-size: 24px; margin-top: 0;">Join ${studioName} on BookPro</h1>
                <p style="color: #a8b5ca; line-height: 1.6;">A workspace administrator has invited you to join their team on BookPro. This secure invitation expires on ${new Date(payload.expiresAt).toLocaleDateString()}.</p>
                <p style="margin: 28px 0;"><a href="${invitationUrl}" style="display: inline-block; padding: 13px 24px; background: #38bdf8; color: #06101f; text-decoration: none; border-radius: 8px; font-weight: bold;">Accept Invitation</a></p>
                <p style="color: #7888a3; font-size: 12px;">If you were not expecting this invitation, you can safely ignore this email.</p>
            </div>
        `;
        const textBody = `You have been invited to join ${studioName} on BookPro. Accept your invitation: ${invitationUrl}`;
        await this.sendBrevoEmail(payload.recipientEmail, subject, htmlBody, textBody, studioName);
    }

    private async dispatchCustomerInvitation(payload: any): Promise<void> {
        const rawToken = EncryptionService.decrypt(payload.encryptedInvitationToken);
        const webUrl = (process.env.WEB_URL || "https://bookpro-fawn.vercel.app").replace(/\/$/, "");
        const invitationUrl = `${webUrl}/customer/invite?token=${encodeURIComponent(rawToken)}`;
        const org = payload.organizationId ? await this.prisma.organization.findUnique({ where: { id: payload.organizationId }, select: { name: true, brandName: true } }) : null;
        const studioName = org?.brandName || org?.name || "BookPro";
        const subject = `${studioName} invited you to connect on BookPro`;
        const htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: auto; padding: 32px; background: #0b1428; color: #eaf2ff; border-radius: 16px;">
                <h1 style="color: #ffffff; font-size: 24px; margin-top: 0;">${studioName} Customer Invitation</h1>
                <p style="color: #a8b5ca; line-height: 1.6;">You have been invited by <strong>${studioName}</strong> to connect your customer account on BookPro to manage appointments and access member services.</p>
                <p style="margin: 28px 0;"><a href="${invitationUrl}" style="display: inline-block; padding: 14px 24px; background: #38bdf8; color: #06101f; text-decoration: none; border-radius: 8px; font-weight: bold;">Review & Accept Invitation</a></p>
                <p style="color: #7888a3; font-size: 12px;">This invitation expires on ${new Date(payload.expiresAt).toLocaleDateString()}.</p>
            </div>
        `;
        const textBody = `${studioName} invited you to connect on BookPro. Accept: ${invitationUrl}`;
        await this.sendBrevoEmail(payload.recipientEmail, subject, htmlBody, textBody, studioName);
    }

    private async dispatchRescheduledEmail(appt: any): Promise<void> {
        const studioName = appt.organization?.brandName || appt.organization?.name || "BookPro";
        const serviceName = appt.service?.name || "Service";
        const staffName = appt.staff?.displayName || "Our Team";
        const locationName = appt.location?.name || "Main Location";
        const locationAddress = appt.location?.address || "";
        const customerName = appt.customer?.fullName || "Valued Guest";
        const startFormatted = new Date(appt.startAt).toLocaleString("en-US", {
            timeZone: appt.location?.timezone || "UTC",
            dateStyle: "full",
            timeStyle: "short",
        });

        const subject = `Appointment Rescheduled: ${serviceName} with ${studioName}`;
        const htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #0284c7; margin: 0 0 16px 0;">Appointment Rescheduled</h2>
                <p>Hello <strong>${customerName}</strong>,</p>
                <p>Your appointment has been updated to a new time:</p>
                <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 16px; margin: 20px 0; border-radius: 4px;">
                    <p style="margin: 4px 0;"><strong>Service:</strong> ${serviceName}</p>
                    <p style="margin: 4px 0;"><strong>New Time:</strong> ${startFormatted}</p>
                    <p style="margin: 4px 0;"><strong>Staff:</strong> ${staffName}</p>
                    <p style="margin: 4px 0;"><strong>Location:</strong> ${locationName} - ${locationAddress}</p>
                </div>
            </div>
        `;
        const textBody = `Hello ${customerName},\n\nYour appointment for ${serviceName} with ${studioName} is rescheduled for ${startFormatted}.\nStaff: ${staffName}`;
        await this.sendBrevoEmail(appt.customer.email, subject, htmlBody, textBody, studioName);
    }

    private async dispatchWaitlistOfferEmail(payload: any): Promise<void> {
        const recipient = payload.recipientEmail;
        if (!recipient) return;
        const studioName = payload.studioName || "BookPro";
        const serviceName = payload.serviceName || "Service";
        const startFormatted = payload.startFormatted || "";
        const claimUrl = payload.claimUrl || `${process.env.WEB_URL || "https://bookpro-fawn.vercel.app"}/waitlist/claim?offerId=${payload.offerId}`;
        const subject = `A slot just opened up for you at ${studioName}!`;
        const htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #059669; margin: 0 0 16px 0;">Slot Available!</h2>
                <p>Good news! An opening has become available for <strong>${serviceName}</strong> at <strong>${studioName}</strong>.</p>
                <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 16px; margin: 20px 0; border-radius: 4px;">
                    <p style="margin: 4px 0;"><strong>Service:</strong> ${serviceName}</p>
                    <p style="margin: 4px 0;"><strong>Time:</strong> ${startFormatted}</p>
                </div>
                <p style="margin: 24px 0;"><a href="${claimUrl}" style="display: inline-block; padding: 12px 24px; background: #059669; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Claim This Appointment</a></p>
                <p style="font-size: 12px; color: #64748b;">Offers are time-limited and available on a first-come basis.</p>
            </div>
        `;
        const textBody = `Good news! A slot opened for ${serviceName} at ${studioName} for ${startFormatted}. Claim it: ${claimUrl}`;
        await this.sendBrevoEmail(recipient, subject, htmlBody, textBody, studioName);
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
