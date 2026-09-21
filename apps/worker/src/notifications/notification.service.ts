import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { NotificationTemplateEngineService } from "./template-engine.service";
import { EMAIL_PROVIDER, EmailProvider } from "./providers/email.provider";
import { SMS_PROVIDER, SmsProvider } from "./providers/sms.provider";
import { NotificationChannelType, NotificationStatusType } from "@bookpro/contracts";
import { RetryClassifier, EncryptionService } from "@bookpro/server-core";

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly templateEngine: NotificationTemplateEngineService,
        @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
        @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
    ) { }

    /**
     * Translates a committed domain outbox event into durable Notification intents
     */
    async handleOutboxEvent(eventType: string, payload: any, eventId?: string, outboxOrgId?: string) {
        const organizationId = outboxOrgId || payload.organizationId || "00000000-0000-0000-0000-000000000001";

        try {
            switch (eventType) {
                case "identity.customer_invitation_requested": {
                    const rawToken = EncryptionService.decrypt(payload.encryptedInvitationToken);
                    const webUrl = (process.env.WEB_URL || "http://localhost:3000").replace(/\/$/, "");
                    const invitationUrl = `${webUrl}/customer/invite?token=${encodeURIComponent(rawToken)}`;
                    const organization = organizationId ? await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, brandName: true } }) : null;
                    const studioName = organization?.brandName || organization?.name || "BookPro";
                    const notification = await this.createDurableNotification({
                        organizationId,
                        recipient: payload.recipientEmail,
                        channel: "EMAIL",
                        eventType,
                        templateName: "customer_invitation",
                        variables: {
                            invitationUrl,
                            studioName,
                            expiresAt: new Date(payload.expiresAt).toLocaleString(),
                        },
                        dedupeKey: `identity:customer-invite:${payload.invitationId}`,
                    });
                    if (!notification || !(await this.processNotification(notification.id))) {
                        throw new Error("Customer invitation was not accepted by the configured provider");
                    }
                    break;
                }
                case "marketing.campaign_recipient_requested": {
                    const organization = organizationId ? await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }) : null;
                    const notification = await this.createDurableNotification({
                        organizationId,
                        recipient: payload.recipientEmail,
                        channel: "EMAIL",
                        eventType,
                        templateName: "organization_campaign",
                        variables: {
                            subject: payload.subject,
                            htmlBody: payload.htmlBody,
                            textBody: payload.textBody,
                            customerName: payload.customerName,
                            studioName: organization?.name || payload.studioName || "BookPro",
                            bookingLink: payload.bookingLink || "",
                            couponCode: payload.couponCode || "",
                            discountValue: payload.discountValue || "",
                        },
                        customerId: payload.customerId,
                        emailCampaignId: payload.campaignId,
                        dedupeKey: `campaign:${payload.campaignId}:${payload.customerId}`,
                    });
                    if (notification) await this.processNotification(notification.id);
                    break;
                }
                case "identity.staff_invitation_requested": {
                    const rawToken = EncryptionService.decrypt(payload.encryptedInvitationToken);
                    const invitationUrl = `${process.env.WEB_URL}/invite/accept?token=${encodeURIComponent(rawToken)}`;
                    const notification = await this.createDurableNotification({ organizationId, recipient: payload.recipientEmail, channel: "EMAIL", eventType, templateName: "staff_invitation", variables: { invitationUrl, expiresAt: new Date(payload.expiresAt).toLocaleString() }, dedupeKey: `identity:invite:${eventId || payload.invitationId}` });
                    if (!notification || !(await this.processNotification(notification.id))) throw new Error("Staff invitation was not accepted by the configured provider");
                    break;
                }
                case "identity.email_verification_requested": {
                    const notification = await this.createDurableNotification({
                        organizationId,
                        recipient: payload.recipientEmail,
                        channel: "EMAIL",
                        eventType,
                        templateName: "email_verification",
                        variables: {
                            fullName: payload.fullName,
                            verificationCode: payload.verificationCode,
                            expiresInMinutes: 15,
                            studioName: "BookPro",
                        },
                        dedupeKey: `identity:verify:${eventId || payload.userId}`,
                    });
                    if (!notification || !(await this.processNotification(notification.id))) {
                        throw new Error("Email verification notification was not accepted by the configured provider");
                    }
                    break;
                }
                case "appointment.created":
                case "appointment.confirmed": {
                    const appointmentId = payload.appointmentId || payload.id;
                    const appt = await this.prisma.appointment.findUnique({
                        where: { id: appointmentId },
                        include: { service: true, staff: true, location: true, customer: true, organization: true },
                    });

                    if (!appt) {
                        this.logger.warn(`[Notification] Appointment ${appointmentId} not found. Skipping confirmation email.`);
                        return;
                    }

                    const recipient = appt.customer.email;
                    const dedupeKey = `notif:confirm:${appt.id}:${recipient}`;

                    const variables = {
                        customerName: appt.customer.fullName || "Valued Guest",
                        serviceName: appt.service?.name || "Service",
                        studioName: appt.organization?.name || "Luxe Studio",
                        staffName: appt.staff?.displayName || "Our Team",
                        locationName: appt.location?.name || "Main Location",
                        locationAddress: appt.location?.address || "",
                        startFormatted: new Date(appt.startAt).toLocaleString("en-US", { timeZone: appt.location?.timezone || "America/New_York", dateStyle: "full", timeStyle: "short" }),
                        durationMin: appt.service?.durationMin || 60,
                        priceFormatted: new Intl.NumberFormat(undefined, { style: "currency", currency: appt.currency || "USD" }).format(appt.priceCents / 100),
                        brandColor: "#0284c7",
                        appointmentVersion: appt.version,
                    };

                    const notification = await this.createDurableNotification({
                        organizationId: appt.organizationId,
                        recipient,
                        channel: "EMAIL",
                        eventType,
                        templateName: "booking_confirmation",
                        variables,
                        appointmentId: appt.id,
                        customerId: appt.customerId,
                        dedupeKey,
                    });

                    if (notification) {
                        await this.processNotification(notification.id);
                    }

                    // Schedule a 1-hour reminder intent if appointment is booked more than 1 hour in advance
                    const oneHourBefore = new Date(new Date(appt.startAt).getTime() - 60 * 60 * 1000);
                    if (oneHourBefore > new Date()) {
                        const reminderDedupeKey = `notif:reminder:v${appt.version}:${appt.id}:${recipient}`;
                        await this.createDurableNotification({
                            organizationId: appt.organizationId,
                            recipient,
                            channel: "EMAIL",
                            eventType: "appointment.reminder",
                            templateName: "appointment_reminder",
                            variables,
                            appointmentId: appt.id,
                            customerId: appt.customerId,
                            scheduledAt: oneHourBefore,
                            dedupeKey: reminderDedupeKey,
                        });
                    }

                    break;
                }

                case "appointment.rescheduled": {
                    const appointmentId = payload.appointmentId || payload.id;
                    const appt = await this.prisma.appointment.findUnique({
                        where: { id: appointmentId },
                        include: { service: true, staff: true, location: true, customer: true, organization: true },
                    });

                    if (!appt) return;

                    const recipient = appt.customer.email;
                    const dedupeKey = `notif:reschedule:v${appt.version}:${appt.id}:${recipient}`;

                    const variables = {
                        customerName: appt.customer.fullName || "Valued Guest",
                        serviceName: appt.service?.name || "Service",
                        studioName: appt.organization?.name || "Luxe Studio",
                        staffName: appt.staff?.displayName || "Our Team",
                        locationName: appt.location?.name || "Main Location",
                        locationAddress: appt.location?.address || "",
                        startFormatted: new Date(appt.startAt).toLocaleString("en-US", { timeZone: appt.location?.timezone || "America/New_York", dateStyle: "full", timeStyle: "short" }),
                        brandColor: "#0284c7",
                        appointmentVersion: appt.version,
                    };

                    const notification = await this.createDurableNotification({
                        organizationId: appt.organizationId,
                        recipient,
                        channel: "EMAIL",
                        eventType,
                        templateName: "appointment_rescheduled",
                        variables,
                        appointmentId: appt.id,
                        customerId: appt.customerId,
                        dedupeKey,
                    });

                    if (notification) {
                        await this.processNotification(notification.id);
                    }
                    break;
                }

                case "appointment.reschedule_proposed": {
                    const appointmentId = payload.appointmentId || payload.id;
                    const appt = await this.prisma.appointment.findUnique({
                        where: { id: appointmentId },
                        include: { service: true, staff: true, location: true, customer: true, organization: true },
                    });

                    if (!appt || !appt.customer?.email) return;

                    const recipient = appt.customer.email;
                    const dedupeKey = `notif:reschedule_prop:v${appt.version}:${appt.id}:${recipient}`;
                    const proposal = payload.proposal || (appt.metadata as any)?.rescheduleProposal || {};

                    const variables = {
                        customerName: appt.customer.fullName || "Valued Guest",
                        serviceName: appt.service?.name || "Service",
                        studioName: appt.organization?.name || "BookPro Studio",
                        staffName: proposal.proposedStaffName || appt.staff?.displayName || "Our Team",
                        proposedStartFormatted: new Date(proposal.proposedStartAt || appt.startAt).toLocaleString("en-US", {
                            timeZone: appt.location?.timezone || "America/New_York",
                            dateStyle: "full",
                            timeStyle: "short",
                        }),
                        reason: proposal.reason,
                        portalUrl: `${process.env.WEB_URL || "http://localhost:3000"}/${appt.organization?.slug || "portal"}/account`,
                        brandColor: "#0284c7",
                    };

                    const notification = await this.createDurableNotification({
                        organizationId: appt.organizationId,
                        recipient,
                        channel: "EMAIL",
                        eventType,
                        templateName: "appointment_reschedule_proposed",
                        variables,
                        appointmentId: appt.id,
                        customerId: appt.customerId,
                        dedupeKey,
                    });

                    if (notification) {
                        await this.processNotification(notification.id);
                    }
                    break;
                }

                case "appointment.cancelled": {
                    const appointmentId = payload.appointmentId || payload.id;
                    const appt = await this.prisma.appointment.findUnique({
                        where: { id: appointmentId },
                        include: { service: true, staff: true, customer: true, organization: true, location: true },
                    });

                    if (!appt || !appt.customer?.email) return;

                    // Suppress / Cancel any pending future reminders for this appointment
                    await this.prisma.notification.updateMany({
                        where: {
                            appointmentId: appt.id,
                            templateName: "appointment_reminder",
                            status: "QUEUED",
                        },
                        data: {
                            status: "CANCELLED",
                        },
                    });

                    const recipient = appt.customer.email;
                    const dedupeKey = `notif:cancel:${appt.id}:${recipient}`;

                    const feeCents = payload.feeCents ?? 0;
                    const refundedCents = payload.refundedCents ?? payload.refundAmountCents ?? 0;
                    const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

                    const orgTz = appt.organization?.timezone || appt.location?.timezone || "UTC";
                    const startFormatted = new Date(appt.startAt).toLocaleString("en-US", {
                        timeZone: orgTz,
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZoneName: "short",
                    });

                    const reason = payload.cancelReason || payload.reason || appt.cancelReason || "Cancelled upon customer request";

                    let financialSummary = "No charges were retained.";
                    if (feeCents > 0 && refundedCents > 0) {
                        financialSummary = `Under organization policy, a cancellation fee of ${formatMoney(feeCents)} was retained, and a refund of ${formatMoney(refundedCents)} has been processed to your original payment method.`;
                    } else if (feeCents > 0) {
                        financialSummary = `Under organization policy, a late cancellation fee of ${formatMoney(feeCents)} was retained.`;
                    } else if (refundedCents > 0) {
                        financialSummary = `A full refund of ${formatMoney(refundedCents)} has been processed to your original payment method.`;
                    }

                    const formatIcsDate = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

                    const icsContent = [
                        "BEGIN:VCALENDAR",
                        "VERSION:2.0",
                        "PRODID:-//BookPro//Appointment System//EN",
                        "CALSCALE:GREGORIAN",
                        "METHOD:CANCEL",
                        "BEGIN:VEVENT",
                        `UID:bp-${appt.id}@bookpro.com`,
                        `DTSTAMP:${formatIcsDate(new Date())}`,
                        `DTSTART:${formatIcsDate(new Date(appt.startAt))}`,
                        `DTEND:${formatIcsDate(new Date(appt.endAt))}`,
                        `SUMMARY:CANCELLED: ${appt.service?.name || "Appointment"} with ${appt.organization?.brandName || appt.organization?.name || "BookPro"}`,
                        `DESCRIPTION:Appointment was cancelled: ${reason}`,
                        `STATUS:CANCELLED`,
                        `SEQUENCE:${appt.version + 1}`,
                        "END:VEVENT",
                        "END:VCALENDAR",
                    ].join("\r\n");

                    const variables = {
                        customerName: appt.customer.fullName || "Valued Guest",
                        serviceName: appt.service?.name || "Service Session",
                        studioName: appt.organization?.brandName || appt.organization?.name || "BookPro Studio",
                        staffName: appt.staff?.displayName || "Our Team",
                        locationName: appt.location?.name || "Studio",
                        locationAddress: appt.location?.address ? `${appt.location.address}, ${appt.location.city || ""}` : "",
                        startFormatted,
                        organizationTimezone: orgTz,
                        reason,
                        feeCents,
                        feeFormatted: feeCents > 0 ? formatMoney(feeCents) : null,
                        refundedCents,
                        refundFormatted: refundedCents > 0 ? formatMoney(refundedCents) : null,
                        financialSummary,
                        bookingRef: appt.id.slice(0, 8).toUpperCase(),
                        rebookUrl: `https://bookpro.app/${appt.organization?.slug || ""}`,
                        brandColor: appt.organization?.primaryColor || "#0284c7",
                        attachment: [
                            {
                                name: `cancellation-${appt.id.slice(0, 8)}.ics`,
                                content: Buffer.from(icsContent, "utf-8").toString("base64"),
                            },
                        ],
                    };

                    const notification = await this.createDurableNotification({
                        organizationId: appt.organizationId,
                        recipient,
                        channel: "EMAIL",
                        eventType,
                        templateName: "appointment_cancelled",
                        variables,
                        appointmentId: appt.id,
                        customerId: appt.customerId,
                        dedupeKey,
                    });

                    if (notification) {
                        await this.processNotification(notification.id);
                    }

                    // Also dispatch notification to organization owner if distinct
                    try {
                        const orgOwner = await this.prisma.membership.findFirst({
                            where: { organizationId: appt.organizationId, roleCode: "OWNER" },
                            include: { user: true },
                        });
                        const ownerEmail = orgOwner?.user?.email;
                        if (ownerEmail && ownerEmail.toLowerCase() !== recipient.toLowerCase()) {
                            const ownerDedupeKey = `notif:cancel_owner:${appt.id}:${ownerEmail}`;
                            const ownerNotif = await this.createDurableNotification({
                                organizationId: appt.organizationId,
                                recipient: ownerEmail,
                                channel: "EMAIL",
                                eventType: "appointment.cancelled.owner",
                                templateName: "appointment_cancelled",
                                variables: {
                                    ...variables,
                                    customerName: `Client ${appt.customer.fullName || "Guest"}`,
                                },
                                appointmentId: appt.id,
                                customerId: appt.customerId,
                                dedupeKey: ownerDedupeKey,
                            });
                            if (ownerNotif) {
                                await this.processNotification(ownerNotif.id);
                            }
                        }
                    } catch (ownerNotifErr: any) {
                        this.logger.warn(`Failed to dispatch owner cancellation notice: ${ownerNotifErr.message}`);
                    }

                    break;
                }

                case "payment.succeeded": {
                    const paymentId = payload.paymentId || payload.id;
                    const payment = await this.prisma.paymentRecord.findUnique({
                        where: { id: paymentId },
                        include: { organization: true, appointment: { include: { customer: true } } },
                    });

                    if (!payment || !payment.appointment?.customer?.email) return;

                    const recipient = payment.appointment.customer.email;
                    const dedupeKey = `notif:receipt:${payment.id}:${recipient}`;

                    const variables = {
                        customerName: payment.appointment.customer.fullName || "Valued Guest",
                        studioName: payment.organization?.name || "Luxe Studio",
                        amountFormatted: `$${(payment.amountCents / 100).toFixed(2)}`,
                        currency: payment.currency,
                        paymentId: payment.id,
                        paidAtFormatted: new Date(payment.paidAt || payment.createdAt).toLocaleString(),
                    };

                    const notification = await this.createDurableNotification({
                        organizationId: payment.organizationId,
                        recipient,
                        channel: "EMAIL",
                        eventType,
                        templateName: "payment_receipt",
                        variables,
                        appointmentId: payment.appointmentId || undefined,
                        customerId: payment.appointment.customerId,
                        dedupeKey,
                    });

                    if (notification) {
                        await this.processNotification(notification.id);
                    }
                    break;
                }

                case "refund.succeeded": {
                    const refundId = payload.refundId || payload.id;
                    const refund = await this.prisma.refundRecord.findUnique({
                        where: { id: refundId },
                        include: { organization: true, payment: { include: { appointment: { include: { customer: true } } } } },
                    });

                    if (!refund || !refund.payment?.appointment?.customer?.email) return;

                    const recipient = refund.payment.appointment.customer.email;
                    const dedupeKey = `notif:refund:${refund.id}:${recipient}`;

                    const variables = {
                        customerName: refund.payment.appointment.customer.fullName || "Valued Guest",
                        studioName: refund.organization?.name || "Luxe Studio",
                        amountFormatted: `$${(refund.amountCents / 100).toFixed(2)}`,
                        currency: refund.currency,
                        refundId: refund.id,
                    };

                    const notification = await this.createDurableNotification({
                        organizationId: refund.organizationId,
                        recipient,
                        channel: "EMAIL",
                        eventType,
                        templateName: "refund_processed",
                        variables,
                        appointmentId: refund.payment.appointmentId || undefined,
                        customerId: refund.payment.appointment.customerId,
                        dedupeKey,
                    });

                    if (notification) {
                        await this.processNotification(notification.id);
                    }
                    break;
                }

                case "waitlist.joined": {
                    const entryId = payload.waitlistEntryId || payload.id;
                    const entry = await this.prisma.waitlistEntry.findUnique({
                        where: { id: entryId },
                        include: { customer: true, service: true, organization: true },
                    });

                    if (!entry || !entry.customer?.email) return;

                    const recipient = entry.customer.email;
                    const dedupeKey = `notif:waitlist_joined:${entry.id}:${recipient}`;

                    const variables = {
                        customerName: entry.customer.fullName || "Valued Guest",
                        studioName: entry.organization?.name || "BookPro Studio",
                        serviceName: entry.service?.name || "Requested Service",
                        startWindowDate: entry.startWindowDate.toISOString().split("T")[0],
                        endWindowDate: entry.endWindowDate.toISOString().split("T")[0],
                        timePreference: entry.timePreference,
                    };

                    const notification = await this.createDurableNotification({
                        organizationId: entry.organizationId,
                        recipient,
                        channel: "EMAIL",
                        eventType,
                        templateName: "waitlist_joined",
                        variables,
                        customerId: entry.customerId,
                        dedupeKey,
                    });

                    if (notification) {
                        await this.processNotification(notification.id);
                    }
                    break;
                }

                case "waitlist.offer_created": {
                    const offerId = payload.offerId || payload.id;
                    const offer = await this.prisma.waitlistOffer.findUnique({
                        where: { id: offerId },
                        include: {
                            waitlistEntry: { include: { customer: true } },
                            service: true,
                            location: true,
                            staff: true,
                            organization: true,
                        },
                    });

                    if (!offer || !offer.waitlistEntry?.customer?.email) return;

                    const recipient = offer.waitlistEntry.customer.email;
                    const dedupeKey = `notif:waitlist_offer:${offer.id}:${recipient}`;

                    const variables = {
                        customerName: offer.waitlistEntry.customer.fullName || "Valued Guest",
                        studioName: offer.organization?.name || "BookPro Studio",
                        serviceName: offer.service?.name || "Service",
                        staffName: offer.staff?.displayName || "Any Available Stylist",
                        locationName: offer.location?.name || "Studio",
                        startFormatted: new Date(offer.startAt).toLocaleString(),
                        expiresFormatted: new Date(offer.expiresAt).toLocaleTimeString(),
                        claimUrl: payload.claimUrl || `/offers/${offer.token}`,
                    };

                    const notification = await this.createDurableNotification({
                        organizationId: offer.organizationId,
                        recipient,
                        channel: "EMAIL",
                        eventType,
                        templateName: "waitlist_offer",
                        variables,
                        customerId: offer.waitlistEntry.customerId,
                        dedupeKey,
                    });

                    if (notification) {
                        await this.processNotification(notification.id);
                    }
                    break;
                }

                case "waitlist.offer_lost": {
                    const offerId = payload.offerId || payload.id;
                    const offer = await this.prisma.waitlistOffer.findUnique({
                        where: { id: offerId },
                        include: {
                            waitlistEntry: { include: { customer: true } },
                            service: true,
                            organization: true,
                        },
                    });

                    if (!offer || !offer.waitlistEntry?.customer?.email) return;

                    const recipient = offer.waitlistEntry.customer.email;
                    const dedupeKey = `notif:waitlist_lost:${offer.id}:${recipient}`;

                    const variables = {
                        customerName: offer.waitlistEntry.customer.fullName || "Valued Guest",
                        studioName: offer.organization?.name || "BookPro Studio",
                        serviceName: offer.service?.name || "Service",
                        startFormatted: new Date(offer.startAt).toLocaleString(),
                    };

                    const notification = await this.createDurableNotification({
                        organizationId: offer.organizationId,
                        recipient,
                        channel: "EMAIL",
                        eventType,
                        templateName: "waitlist_offer_lost",
                        variables,
                        customerId: offer.waitlistEntry.customerId,
                        dedupeKey,
                    });

                    if (notification) {
                        await this.processNotification(notification.id);
                    }
                    break;
                }

                default:
                    this.logger.debug(`[Notification] Unhandled domain event type for notification delivery: ${eventType}`);
                    break;
            }
        } catch (err: any) {
            this.logger.error(`[Notification] Failed to translate outbox event ${eventType}: ${err.message}`, err.stack);
            throw err;
        }
    }

    /**
     * Creates a durable notification record with deduplication support
     */
    async createDurableNotification(data: {
        organizationId?: string | null;
        recipient: string;
        channel: NotificationChannelType;
        eventType: string;
        templateName: string;
        variables: Record<string, any>;
        appointmentId?: string;
        customerId?: string;
        emailCampaignId?: string;
        scheduledAt?: Date;
        dedupeKey?: string;
    }) {
        if (data.dedupeKey) {
            const existing = await this.prisma.notification.findUnique({
                where: { dedupeKey: data.dedupeKey },
            });
            if (existing) {
                this.logger.log(`[Notification] Reusing notification with dedupe key "${data.dedupeKey}".`);
                return existing;
            }
        }

        return this.prisma.notification.create({
            data: {
                organizationId: data.organizationId,
                recipient: data.recipient,
                channel: data.channel,
                eventType: data.eventType,
                templateName: data.templateName,
                variables: data.variables,
                appointmentId: data.appointmentId || null,
                customerId: data.customerId || null,
                emailCampaignId: data.emailCampaignId || null,
                scheduledAt: data.scheduledAt || new Date(),
                dedupeKey: data.dedupeKey || null,
                status: "QUEUED",
            },
        });
    }

    /**
     * Executes the delivery of a durable notification with idempotent current-state checks
     */
    async processNotification(notificationId: string): Promise<boolean> {
        const notif = await this.prisma.notification.findUnique({
            where: { id: notificationId },
        });

        if (!notif) {
            this.logger.warn(`[Notification] Notification ${notificationId} not found for processing.`);
            return false;
        }

        if (notif.status === "SENT" || notif.status === "CANCELLED") {
            this.logger.log(`[Notification] Notification ${notificationId} already ${notif.status}. Skipping.`);
            return true;
        }

        if (notif.status === "PROCESSING" && notif.attempts >= 5) {
            await this.prisma.notification.update({ where: { id: notif.id }, data: { status: "FAILED", failedAt: new Date(), lastError: "Maximum delivery attempts reached" } });
            await this.countCampaignResult(notif.id, false);
            return false;
        }

        // Stale Reminder Guard (PRD §35 / Architecture §116)
        if (notif.templateName === "appointment_reminder" && notif.appointmentId) {
            const appt = await this.prisma.appointment.findUnique({
                where: { id: notif.appointmentId },
            });

            if (!appt || appt.status !== "CONFIRMED") {
                this.logger.log(`[Notification] Appointment ${notif.appointmentId} is no longer confirmed. Cancelling reminder.`);
                await this.prisma.notification.update({
                    where: { id: notif.id },
                    data: { status: "CANCELLED" },
                });
                return true;
            }

            const expectedVersion = (notif.variables as any)?.appointmentVersion;
            if (expectedVersion !== undefined && appt.version !== expectedVersion) {
                this.logger.log(`[Notification] Appointment version changed (Scheduled v${expectedVersion} vs Current v${appt.version}). Skipping stale reminder.`);
                await this.prisma.notification.update({
                    where: { id: notif.id },
                    data: { status: "CANCELLED" },
                });
                return true;
            }
        }

        // Mark PROCESSING
        await this.prisma.notification.update({
            where: { id: notif.id },
            data: { status: "PROCESSING", attempts: { increment: 1 } },
        });

        // Render Template
        const rendered = this.templateEngine.render(notif.templateName, notif.variables as any);

        // Dispatch via Provider
        let sendResult;
        if (notif.channel === "SMS") {
            sendResult = await this.smsProvider.sendSms({
                organizationId: notif.organizationId || "system",
                recipientPhone: notif.recipient,
                message: rendered.textBody,
            });
        } else {
            sendResult = await this.emailProvider.sendEmail({
                organizationId: notif.organizationId || "system",
                recipientEmail: notif.recipient,
                subject: rendered.subject,
                htmlBody: rendered.htmlBody,
                textBody: rendered.textBody,
                senderName: (notif.variables as any)?.studioName,
                correlationId: notif.id,
                idempotencyKey: notif.id,
                attachment: (notif.variables as any)?.attachment,
            } as any);
        }

        if (sendResult.success) {
            await this.prisma.notification.update({
                where: { id: notif.id },
                data: {
                    status: "SENT",
                    providerId: sendResult.providerMessageId,
                    sentAt: new Date(),
                    ...(notif.templateName === "email_verification" ? { variables: { delivery: "redacted_after_send" } } : {}),
                },
            });
            await this.countCampaignResult(notif.id, true);
            this.logger.log(`[Notification] Notification ${notif.id} [${notif.templateName}] sent successfully (Provider ID: ${sendResult.providerMessageId}).`);
            return true;
        } else {
            const classification = RetryClassifier.classify({ message: sendResult.error, isRetryable: sendResult.isRetryable });
            if (!classification.isRetryable) {
                // Terminal failure
                await this.prisma.notification.update({
                    where: { id: notif.id },
                    data: {
                        status: "FAILED",
                        lastError: sendResult.error,
                        failedAt: new Date(),
                    },
                });
                await this.countCampaignResult(notif.id, false);
                this.logger.warn(`[Notification] Notification ${notif.id} failed permanently: ${sendResult.error} (${classification.reason})`);
                return false;
            } else {
                // Transient failure
                await this.prisma.notification.update({
                    where: { id: notif.id },
                    data: {
                        lastError: sendResult.error,
                    },
                });
                this.logger.warn(`[Notification] Notification ${notif.id} transient failure, will retry: ${sendResult.error}`);
                throw new Error(sendResult.error);
            }
        }
    }

    private async countCampaignResult(notificationId: string, delivered: boolean): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const notification = await tx.notification.findUnique({ where: { id: notificationId }, select: { emailCampaignId: true, campaignCountedAt: true } });
            if (!notification?.emailCampaignId || notification.campaignCountedAt) return;
            const counted = await tx.notification.updateMany({ where: { id: notificationId, campaignCountedAt: null }, data: { campaignCountedAt: new Date() } });
            if (counted.count !== 1) return;
            const campaign = await tx.emailCampaign.update({ where: { id: notification.emailCampaignId }, data: delivered ? { deliveredCount: { increment: 1 } } : { failedCount: { increment: 1 } } });
            if (campaign.deliveredCount + campaign.failedCount >= campaign.recipientCount) {
                await tx.emailCampaign.update({ where: { id: campaign.id }, data: { status: "SENT", sentAt: new Date() } });
            }
        });
    }

    /**
     * Polls and processes due queued notifications (such as 24h reminders)
     */
    async pollAndProcessQueuedNotifications(limit = 20): Promise<number> {
        try {
            const dueNotifications = await this.prisma.notification.findMany({
                where: {
                    status: "QUEUED",
                    scheduledAt: { lte: new Date() },
                },
                orderBy: { scheduledAt: "asc" },
                take: limit,
            });

            if (dueNotifications.length === 0) return 0;

            let processedCount = 0;
            for (const notif of dueNotifications) {
                try {
                    const success = await this.processNotification(notif.id);
                    if (success) processedCount++;
                } catch (notifErr: any) {
                    this.logger.warn(`[Notification] Failed processing queued notification ${notif.id}: ${notifErr.message}`);
                }
            }

            return processedCount;
        } catch (err: any) {
            this.logger.error(`[Notification] Error in pollAndProcessQueuedNotifications: ${err.message}`, err.stack);
            return 0;
        }
    }
}
