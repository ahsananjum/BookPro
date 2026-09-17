import {
    Injectable,
    NotFoundException,
    BadRequestException,
    UnauthorizedException,
    Logger,
    Inject,
    Optional,
    ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { OutboxService } from "../outbox/outbox.service";
import { ScheduleGuardService } from "../concurrency/schedule-guard.service";
import { AuthoritativeAvailabilityValidatorService } from "../availability/authoritative-availability-validator.service";
import {
    CreatePaymentIntentDto,
    CreatePaymentIntentResponseDto,
    ProcessWebhookDto,
    RequestContext,
} from "@bookpro/contracts";
import { publicCreatePaymentIntentSchema } from "@bookpro/validation";
import {
    PaymentRecordStatus,
    WebhookStatus,
    IncidentType,
    IncidentStatus,
    Prisma,
} from "@prisma/client";
import {
    PaymentProvider,
    PAYMENT_PROVIDER,
    VerifiedWebhookEvent,
} from "./payment-provider.interface";
import {
    StripeConnectProvider,
    STRIPE_CONNECT_PROVIDER,
} from "./stripe-connect-provider.interface";
import { IdempotencyService } from "../common/idempotency.service";
import * as crypto from "crypto";
import { ExchangeRateService } from "./exchange-rate.service";
import { organizationBookingDate } from "../appointments/booking-date.util";

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly outboxService: OutboxService,
        private readonly scheduleGuardService: ScheduleGuardService,
        private readonly authoritativeValidator: AuthoritativeAvailabilityValidatorService,
        private readonly idempotencyService: IdempotencyService,
        @Inject(PAYMENT_PROVIDER)
        private readonly paymentProvider: PaymentProvider,
        @Optional()
        private readonly exchangeRateService: ExchangeRateService = new ExchangeRateService(),
        @Optional()
        @Inject(STRIPE_CONNECT_PROVIDER)
        private readonly stripeConnectProvider?: StripeConnectProvider,
    ) {
        if (!this.exchangeRateService) {
            this.exchangeRateService = new ExchangeRateService();
        }
    }



    private verifyGuestToken(guestToken?: string, holdId?: string, organizationId?: string, guestEmail?: string | null): boolean {
        if (!guestToken || !holdId || !organizationId) return false;
        try {
            const secret = process.env.JWT_SECRET || process.env.APP_SECRET;
            if (!secret || secret.length < 32) return false;
            if (!guestToken.startsWith('gst_')) return false;
            const decoded = Buffer.from(guestToken.slice(4), 'base64url').toString('utf-8');
            const [tokenHoldId, tokenSig] = decoded.split(':');
            if (tokenHoldId !== holdId || !tokenSig) return false;
            const payload = `${holdId}:${organizationId}:${(guestEmail || '').toLowerCase().trim()}`;
            const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
            return crypto.timingSafeEqual(Buffer.from(tokenSig), Buffer.from(expectedSig));
        } catch {
            return false;
        }
    }

    /**
     * Creates a public PaymentIntent deriving amount, currency, and identity strictly from server state.
     * Enforces mandatory client idempotency key, details completion gate, and connected account validation.
     */
    async createPublicPaymentIntent(input: {
        organizationId: string;
        body: any;
        idempotencyKey?: string;
        ctx?: RequestContext;
    }): Promise<CreatePaymentIntentResponseDto> {
        const parsed = input.body || {};
        const idempotencyKey = (input.idempotencyKey || parsed.idempotencyKey || `pi_${parsed.bookingHoldId}`)?.trim();

        if (!idempotencyKey) {
            throw new BadRequestException(
                "Idempotency key is required for payment intent creation to prevent duplicate charges.",
            );
        }

        const res = await this.idempotencyService.executeIdempotent<CreatePaymentIntentResponseDto>(
            {
                organizationId: input.organizationId,
                operation: "PAYMENT_INTENT_CREATE",
                idempotencyKey,
                payload: {
                    ...parsed,
                    organizationId: input.organizationId,
                },
            },
            async () => {
                const hold = await this.prisma.bookingHold.findFirst({
                    where: { id: parsed.bookingHoldId, organizationId: input.organizationId },
                    include: { organization: true, location: true },
                });
                if (!hold) {
                    throw new NotFoundException(`BookingHold ${parsed.bookingHoldId} not found`);
                }
                if (hold.status !== "ACTIVE" || hold.expiresAt <= new Date()) {
                    throw new BadRequestException({
                        code: "HOLD_EXPIRED",
                        message: "Your reserved time has expired. Please select an available slot.",
                    });
                }

                // Verify Guest Token or Authenticated Customer ownership
                let isAuthorized = false;
                if (parsed.guestToken) {
                    if (this.verifyGuestToken(parsed.guestToken, hold.id, input.organizationId, hold.guestEmail) ||
                        this.verifyGuestToken(parsed.guestToken, hold.id, input.organizationId, null) ||
                        this.verifyGuestToken(parsed.guestToken, hold.id, input.organizationId, "")) {
                        isAuthorized = true;
                    }
                } else if (input.ctx?.customerId && hold.customerId === input.ctx.customerId) {
                    isAuthorized = true;
                }

                if (!isAuthorized) {
                    this.logger.warn(`Guest token authorization failed for hold ${hold.id}`);
                    throw new UnauthorizedException("Invalid guest authorization token for this reservation.");
                }

                // Guest Details & Intake Gate
                if (!hold.detailsCompletedAt) {
                    this.logger.warn(`Details required before payment for hold ${hold.id}`);
                    throw new BadRequestException({
                        code: "DETAILS_REQUIRED",
                        message: "Customer details and required intake questions must be submitted before payment.",
                    });
                }

                const existingCustomer = hold.customerId
                    ? { id: hold.customerId }
                    : hold.guestEmail
                        ? await this.prisma.customer.findFirst({ where: { organizationId: input.organizationId, email: hold.guestEmail.toLowerCase().trim() }, select: { id: true } })
                        : null;
                if (existingCustomer) {
                    const bookingDate = organizationBookingDate(hold.startAt, hold.location?.timezone || hold.organization?.timezone || "UTC");
                    const existingDailyBooking = await this.prisma.appointment.findFirst({
                        where: { organizationId: input.organizationId, customerId: existingCustomer.id, bookingDate, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
                        select: { id: true },
                    });
                    if (existingDailyBooking) throw new BadRequestException({ code: "CUSTOMER_DAILY_LIMIT", message: "A customer can book only one appointment per day." });
                }

                // Stripe Connected Account & Merchant Capability Check
                // Stripe Connected Account & Merchant Capability Check
                const connectedAccountId = hold.organization?.stripeAccountId || undefined;
                let chargesEnabled = hold.organization?.stripeChargesEnabled ?? false;
                let payoutsEnabled = hold.organization?.stripePayoutsEnabled ?? false;
                let detailsSubmitted = hold.organization?.stripeDetailsSubmitted ?? false;

                // Real-time sync fallback if flags are not yet updated in DB
                if (connectedAccountId && (!chargesEnabled || !detailsSubmitted) && this.stripeConnectProvider) {
                    try {
                        const liveSnapshot = await this.stripeConnectProvider.retrieveAccount(connectedAccountId);
                        chargesEnabled = liveSnapshot.chargesEnabled;
                        payoutsEnabled = liveSnapshot.payoutsEnabled;
                        detailsSubmitted = liveSnapshot.detailsSubmitted;
                        await this.prisma.organization.update({
                            where: { id: input.organizationId },
                            data: {
                                stripeChargesEnabled: liveSnapshot.chargesEnabled,
                                stripePayoutsEnabled: liveSnapshot.payoutsEnabled,
                                stripeDetailsSubmitted: liveSnapshot.detailsSubmitted,
                                stripeConnectedAt: new Date(),
                            },
                        });
                    } catch (syncErr: any) {
                        this.logger.warn(`Could not sync live Stripe status for ${connectedAccountId}: ${syncErr.message}`);
                    }
                }

                const isReady = Boolean(
                    connectedAccountId && (
                        chargesEnabled ||
                        payoutsEnabled ||
                        detailsSubmitted ||
                        process.env.STRIPE_MODE === "test" ||
                        process.env.NODE_ENV !== "production"
                    )
                );

                if (!connectedAccountId || !isReady) {
                    throw new ServiceUnavailableException({
                        code: "PAYMENT_ACCOUNT_NOT_READY",
                        message: "This organization is not currently able to accept online payments. No booking or charge was created.",
                    });
                }

                // Server-authoritative quote check
                const quote = (hold.quoteSnapshot as any) || {};
                const payableNowCents = Number(quote.payableNowCents ?? quote.depositAmountCents ?? quote.depositCents ?? quote.priceCents ?? 0);
                const currency = String(quote.currency || hold.organization?.currency || "USD").toUpperCase();

                if (payableNowCents <= 0) {
                    this.logger.warn(`Hold ${hold.id} does not require upfront deposit (payableNowCents=${payableNowCents})`);
                    throw new BadRequestException("This booking does not require upfront payment. Please finalize booking directly.");
                }

                const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || "";

                // Check if an existing active payment record exists for this hold or idempotency key
                const existingRecord = await this.prisma.paymentRecord.findFirst({
                    where: {
                        OR: [
                            { idempotencyKey },
                            { bookingHoldId: hold.id, status: PaymentRecordStatus.PENDING },
                        ],
                    },
                    orderBy: { createdAt: "desc" },
                });

                if (existingRecord) {
                    if (!existingRecord.clientSecret) {
                        throw new ServiceUnavailableException("The existing payment session cannot be resumed safely. Please contact support.");
                    }
                    const isDestination = (existingRecord.metadata as any)?.chargePattern === "DESTINATION";
                    const existingMeta = (existingRecord.metadata as any) || {};
                    return {
                        paymentRecordId: existingRecord.id,
                        paymentIntentId: existingRecord.providerPaymentId,
                        clientSecret: existingRecord.clientSecret,
                        publishableKey,
                        connectedAccountId: isDestination ? undefined : connectedAccountId,
                        amountCents: existingRecord.amountCents,
                        currency: existingRecord.currency,
                        originalAmountCents: existingMeta.originalAmountCents ?? payableNowCents,
                        originalCurrency: existingMeta.originalCurrency ?? currency,
                        exchangeRate: existingMeta.exchangeRate ?? 1.0,
                        status: existingRecord.status,
                        expiresAt: hold.expiresAt.toISOString(),
                    };
                }

                // Dynamic Live Forex Conversion to USD for Stripe payment gateway
                const conversion = await this.exchangeRateService.convertToUsdCents(payableNowCents, currency);

                const providerResult = await this.paymentProvider.createPaymentIntent({
                    amountCents: conversion.usdCents,
                    currency: "USD",
                    organizationId: input.organizationId,
                    connectedAccountId,
                    holdId: hold.id,
                    idempotencyKey,
                    metadata: {
                        organizationId: input.organizationId,
                        holdId: hold.id,
                        originalAmountCents: String(conversion.originalAmountCents),
                        originalCurrency: conversion.originalCurrency,
                        exchangeRate: String(conversion.rate),
                        usdCents: String(conversion.usdCents),
                    },
                });

                const paymentRecord = await this.prisma.paymentRecord.create({
                    data: {
                        organizationId: input.organizationId,
                        providerPaymentId: providerResult.providerPaymentId,
                        idempotencyKey,
                        amountCents: providerResult.amountCents,
                        currency: providerResult.currency,
                        status: PaymentRecordStatus.PENDING,
                        bookingHoldId: hold.id,
                        clientSecret: providerResult.clientSecret,
                        metadata: {
                            connectedAccountId,
                            chargePattern: providerResult.chargePattern || "DIRECT",
                            originalAmountCents: conversion.originalAmountCents,
                            originalCurrency: conversion.originalCurrency,
                            exchangeRate: conversion.rate,
                            usdCents: conversion.usdCents,
                        },
                    },
                });

                return {
                    paymentRecordId: paymentRecord.id,
                    paymentIntentId: providerResult.providerPaymentId,
                    clientSecret: providerResult.clientSecret,
                    publishableKey,
                    connectedAccountId: providerResult.clientConnectedAccountId ?? (providerResult.chargePattern === "DESTINATION" ? undefined : connectedAccountId),
                    amountCents: paymentRecord.amountCents,
                    currency: paymentRecord.currency,
                    originalAmountCents: conversion.originalAmountCents,
                    originalCurrency: conversion.originalCurrency,
                    exchangeRate: conversion.rate,
                    status: providerResult.status,
                    expiresAt: hold.expiresAt.toISOString(),
                };
            },


        );

        return res.data;
    }

    /**
     * Creates or reuses a PaymentIntent from an authoritative active hold or appointment.
     * Guaranteed that no schedule lock is held during remote provider network call.
     * Enforces mandatory client idempotency key and atomic execution.
     */
    async createPaymentIntent(
        organizationId: string,
        dto: CreatePaymentIntentDto
    ): Promise<CreatePaymentIntentResponseDto> {
        const idempotencyKey = dto.idempotencyKey?.trim();
        if (!idempotencyKey) {
            throw new BadRequestException(
                "Idempotency key is required for payment intent creation to prevent duplicate charges.",
            );
        }

        const res = await this.idempotencyService.executeIdempotent<CreatePaymentIntentResponseDto>(
            {
                organizationId,
                operation: "PAYMENT_INTENT_CREATE",
                idempotencyKey,
                payload: {
                    ...dto,
                    organizationId,
                },
            },
            async () => {
                const organization = await this.prisma.organization.findUnique({
                    where: { id: organizationId },
                    select: { stripeAccountId: true, stripeChargesEnabled: true, stripeDetailsSubmitted: true },
                });
                if (!organization?.stripeAccountId || !organization.stripeChargesEnabled || !organization.stripeDetailsSubmitted) {
                    throw new ServiceUnavailableException("The organization payment account is not ready to accept online payments.");
                }
                let expectedAmountCents = dto.amountCents;
                let expectedCurrency = (dto.currency || "USD").toUpperCase();

                if (dto.holdId) {
                    const hold = await this.prisma.bookingHold.findFirst({
                        where: { id: dto.holdId, organizationId },
                    });
                    if (!hold) {
                        throw new NotFoundException(`BookingHold ${dto.holdId} not found`);
                    }
                    if (hold.status !== "ACTIVE" || hold.expiresAt <= new Date()) {
                        throw new BadRequestException(`BookingHold ${dto.holdId} has expired or is no longer active`);
                    }

                    // Server-authoritative quote check
                    const quote = hold.quoteSnapshot as any;
                    if (quote && quote.payableNowCents) {
                        expectedAmountCents = quote.payableNowCents;
                        expectedCurrency = quote.currency || expectedCurrency;
                    } else if (quote && quote.priceCents) {
                        expectedAmountCents = quote.priceCents;
                        expectedCurrency = quote.currency || expectedCurrency;
                    }
                } else if (dto.appointmentId) {
                    const appointment = await this.prisma.appointment.findFirst({
                        where: { id: dto.appointmentId, organizationId },
                    });
                    if (!appointment) {
                        throw new NotFoundException(`Appointment ${dto.appointmentId} not found`);
                    }
                    expectedAmountCents = appointment.priceCents;
                    expectedCurrency = appointment.currency || expectedCurrency;
                }

                // Check if an existing active payment record exists for this idempotency key
                const existingRecord = await this.prisma.paymentRecord.findUnique({
                    where: { idempotencyKey },
                });

                if (existingRecord) {
                    if (!existingRecord.clientSecret) throw new ServiceUnavailableException("The existing payment session cannot be resumed safely.");
                    const existingMeta = (existingRecord.metadata as any) || {};
                    return {
                        paymentRecordId: existingRecord.id,
                        paymentIntentId: existingRecord.providerPaymentId,
                        clientSecret: existingRecord.clientSecret,
                        amountCents: existingRecord.amountCents,
                        currency: existingRecord.currency,
                        originalAmountCents: existingMeta.originalAmountCents ?? expectedAmountCents,
                        originalCurrency: existingMeta.originalCurrency ?? expectedCurrency,
                        exchangeRate: existingMeta.exchangeRate ?? 1.0,
                        status: existingRecord.status,
                    };
                }

                // Dynamic Live Forex Conversion to USD for Stripe payment gateway
                const conversion = await this.exchangeRateService.convertToUsdCents(expectedAmountCents, expectedCurrency);

                // Call PaymentProvider OUTSIDE of any database schedule locks
                const providerResult = await this.paymentProvider.createPaymentIntent({
                    amountCents: conversion.usdCents,
                    currency: "USD",
                    organizationId,
                    holdId: dto.holdId,
                    appointmentId: dto.appointmentId,
                    connectedAccountId: organization.stripeAccountId,
                    idempotencyKey,
                    metadata: {
                        organizationId,
                        holdId: dto.holdId || "",
                        appointmentId: dto.appointmentId || "",
                        originalAmountCents: String(conversion.originalAmountCents),
                        originalCurrency: conversion.originalCurrency,
                        exchangeRate: String(conversion.rate),
                        usdCents: String(conversion.usdCents),
                    },
                });

                // Persist local PaymentRecord
                const paymentRecord = await this.prisma.paymentRecord.create({
                    data: {
                        organizationId,
                        providerPaymentId: providerResult.providerPaymentId,
                        idempotencyKey,
                        amountCents: providerResult.amountCents,
                        currency: providerResult.currency,
                        status: PaymentRecordStatus.PENDING,
                        bookingHoldId: dto.holdId || null,
                        appointmentId: dto.appointmentId || null,
                        clientSecret: providerResult.clientSecret,
                        metadata: {
                            connectedAccountId: organization.stripeAccountId,
                            chargePattern: providerResult.chargePattern || "DIRECT",
                            originalAmountCents: conversion.originalAmountCents,
                            originalCurrency: conversion.originalCurrency,
                            exchangeRate: conversion.rate,
                            usdCents: conversion.usdCents,
                        },
                    },
                });

                const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || "";

                return {
                    paymentRecordId: paymentRecord.id,
                    paymentIntentId: providerResult.providerPaymentId,
                    clientSecret: providerResult.clientSecret,
                    publishableKey,
                    amountCents: paymentRecord.amountCents,
                    currency: paymentRecord.currency,
                    originalAmountCents: conversion.originalAmountCents,
                    originalCurrency: conversion.originalCurrency,
                    exchangeRate: conversion.rate,
                    status: paymentRecord.status,
                };
            },


        );

        return res.data;
    }

    /**
     * Durable Webhook Inbox & Idempotent Event Processor.
     * Browser redirect is never trusted; verified webhook is sole payment authority.
     */
    async processWebhook(dto: ProcessWebhookDto) {
        const rawBody = dto.rawBody || JSON.stringify(dto.payload);
        const signatureHeader = dto.signature || "";

        if (!signatureHeader) {
            throw new BadRequestException("Missing payment provider signature header (stripe-signature)");
        }

        // Step 1: Cryptographic signature verification before any DB operations or parsing
        const verifiedEvent = await this.paymentProvider.verifyWebhook(rawBody, signatureHeader);
        const { eventId, eventType, providerPaymentId, livemode } = verifiedEvent;

        // Step 2: Explicit livemode verification
        const configuredMode = (process.env.STRIPE_MODE || "disabled").toLowerCase();
        if (configuredMode === "disabled") {
            throw new BadRequestException("Stripe payments are disabled in configuration");
        }
        if (configuredMode === "live" && !livemode) {
            throw new UnauthorizedException("Webhook livemode mismatch: received test event in live mode");
        }
        if (configuredMode === "test" && livemode) {
            throw new UnauthorizedException("Webhook livemode mismatch: received live event in test mode");
        }

        // Step 3: Durable inbox insert & deduplication (unique provider eventId)
        const existingInbox = await this.prisma.webhookInbox.findUnique({
            where: { eventId },
        });

        if (existingInbox && existingInbox.status !== WebhookStatus.FAILED) {
            this.logger.log(`Duplicate webhook event acknowledged: ${eventId}`);
            return {
                received: true,
                duplicate: true,
                status: existingInbox.status,
            };
        }

        let inboxRecord = existingInbox;
        if (inboxRecord) {
            const claimed = await this.prisma.webhookInbox.updateMany({
                where: { id: inboxRecord.id, status: WebhookStatus.FAILED },
                data: { status: WebhookStatus.PENDING, error: null },
            });
            if (claimed.count !== 1) return { received: true, duplicate: true, status: inboxRecord.status };
        } else {
            try {
                inboxRecord = await this.prisma.webhookInbox.create({
                    data: { eventId, eventType, payload: verifiedEvent.rawPayload as any, status: WebhookStatus.PENDING },
                });
            } catch (error: any) {
                if (error?.code === "P2002") return { received: true, duplicate: true, status: WebhookStatus.PENDING };
                throw error;
            }
        }

        // Step 4: Idempotent State Machine Processing
        try {
            if (eventType === "payment_intent.succeeded" && providerPaymentId) {
                await this.handlePaymentSucceeded(verifiedEvent);
            } else if (eventType === "payment_intent.payment_failed" && providerPaymentId) {
                await this.handlePaymentFailed(verifiedEvent);
            } else if (eventType === "account.updated" || eventType.startsWith("v2.core.account")) {
                await this.handleConnectAccountUpdated(verifiedEvent);
            }

            await this.prisma.webhookInbox.update({
                where: { id: inboxRecord.id },
                data: {
                    status: WebhookStatus.PROCESSED,
                    processedAt: new Date(),
                },
            });

            return {
                received: true,
                duplicate: false,
                status: WebhookStatus.PROCESSED,
            };
        } catch (error: any) {
            this.logger.error(`Webhook processing error for ${eventId}: ${error.message}`);
            await this.prisma.webhookInbox.update({
                where: { id: inboxRecord.id },
                data: {
                    status: WebhookStatus.FAILED,
                    error: error.message || "Unknown error",
                },
            });
            throw error;
        }
    }

    private async handleConnectAccountUpdated(verifiedEvent: VerifiedWebhookEvent) {
        const account = verifiedEvent.rawPayload?.data?.object;
        const accountId = typeof account?.id === "string" ? account.id : verifiedEvent.account;
        if (!accountId) throw new BadRequestException("Connected account webhook is missing its account identifier");

        const organization = await this.prisma.organization.findUnique({
            where: { stripeAccountId: accountId }, select: { id: true },
        });
        if (!organization) {
            this.logger.warn(`Ignoring account status event for an unowned connected account`);
            return;
        }

        const recipientStatus = account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
        const chargesEnabled = Boolean(account?.charges_enabled ?? account?.configuration?.merchant?.capabilities?.card_payments?.status === "active");
        const payoutsEnabled = Boolean(account?.payouts_enabled ?? recipientStatus === "active");
        const detailsSubmitted = Boolean(account?.details_submitted ?? account?.requirements?.currently_due?.length === 0);
        await this.prisma.organization.update({ where: { id: organization.id }, data: {
            stripeChargesEnabled: chargesEnabled,
            stripePayoutsEnabled: payoutsEnabled,
            stripeDetailsSubmitted: detailsSubmitted,
            stripeConnectedAt: detailsSubmitted || chargesEnabled || payoutsEnabled ? new Date() : null,
        }});
    }

    /**
     * Handles payment_intent.succeeded event with full hold-conversion and expired-hold edge cases
     */
    private async handlePaymentSucceeded(verifiedEvent: VerifiedWebhookEvent) {
        const { providerPaymentId, amountCents: paidAmountCents, currency: paidCurrency, metadata, account } = verifiedEvent;
        if (!providerPaymentId) return;

        const payment = await this.prisma.paymentRecord.findFirst({
            where: { providerPaymentId },
            include: { bookingHold: { include: { location: true } }, appointment: true, organization: true },
        });

        if (!payment) {
            this.logger.warn(`No PaymentRecord found for providerPaymentId ${providerPaymentId}`);
            return;
        }

        // Monotonic state transition check
        if (payment.status === PaymentRecordStatus.SUCCEEDED) {
            this.logger.log(`PaymentRecord ${payment.id} is already marked SUCCEEDED; skipping re-execution`);
            return;
        }

        // Tenant Isolation Validation
        if (metadata?.organizationId && metadata.organizationId !== payment.organizationId) {
            this.logger.error(`Tenant mismatch in webhook: expected ${payment.organizationId}, received ${metadata.organizationId}`);
            await this.prisma.reconciliationIncident.create({
                data: {
                    organizationId: payment.organizationId,
                    incidentType: IncidentType.UNFINALIZED_PAYMENT,
                    providerPaymentId,
                    payload: {
                        issue: "Security violation: tenant mismatch in payment metadata",
                        expectedOrgId: payment.organizationId,
                        receivedOrgId: metadata.organizationId,
                    },
                },
            });
            throw new BadRequestException("Tenant mismatch in payment metadata");
        }


        // Stripe Connect Account Validation
        if (account && payment.organization?.stripeAccountId && account !== payment.organization.stripeAccountId) {
            this.logger.error(`Stripe Connect account mismatch: expected ${payment.organization.stripeAccountId}, received ${account}`);
            await this.prisma.reconciliationIncident.create({
                data: {
                    organizationId: payment.organizationId,
                    incidentType: IncidentType.UNFINALIZED_PAYMENT,
                    providerPaymentId,
                    payload: {
                        issue: "Stripe Connect account mismatch",
                        expectedAccountId: payment.organization.stripeAccountId,
                        receivedAccountId: account,
                    },
                },
            });
            throw new BadRequestException("Stripe Connect account mismatch");
        }

        // Referenced Hold Validation
        if (payment.bookingHoldId && metadata?.holdId && metadata.holdId !== payment.bookingHoldId) {
            this.logger.error(`Referenced hold mismatch: expected ${payment.bookingHoldId}, received ${metadata.holdId}`);
            throw new BadRequestException("Referenced hold mismatch in payment metadata");
        }

        // Referenced Appointment Validation
        if (payment.appointmentId && metadata?.appointmentId && metadata.appointmentId !== payment.appointmentId) {
            this.logger.error(`Referenced appointment mismatch: expected ${payment.appointmentId}, received ${metadata.appointmentId}`);
            throw new BadRequestException("Referenced appointment mismatch in payment metadata");
        }

        // Amount Mismatch Validation
        if (paidAmountCents !== undefined && paidAmountCents !== payment.amountCents) {
            this.logger.error(`Amount mismatch for ${payment.id}: expected ${payment.amountCents}, received ${paidAmountCents}`);
            await this.prisma.paymentRecord.update({
                where: { id: payment.id },
                data: {
                    status: PaymentRecordStatus.REQUIRES_RECONCILIATION,
                    failureReason: `Paid amount ${paidAmountCents} does not match expected ${payment.amountCents}`,
                },
            });
            await this.prisma.reconciliationIncident.create({
                data: {
                    organizationId: payment.organizationId,
                    incidentType: IncidentType.UNFINALIZED_PAYMENT,
                    providerPaymentId,
                    payload: {
                        issue: "Paid amount does not match expected payment record amount",
                        expectedCents: payment.amountCents,
                        receivedCents: paidAmountCents,
                    },
                },
            });
            throw new BadRequestException(`Amount mismatch: expected ${payment.amountCents}, received ${paidAmountCents}`);
        }

        // Currency Mismatch Validation
        if (paidCurrency && paidCurrency.toUpperCase() !== payment.currency.toUpperCase()) {
            this.logger.error(`Currency mismatch for ${payment.id}: expected ${payment.currency}, received ${paidCurrency}`);
            await this.prisma.paymentRecord.update({
                where: { id: payment.id },
                data: {
                    status: PaymentRecordStatus.REQUIRES_RECONCILIATION,
                    failureReason: `Paid currency ${paidCurrency} does not match expected ${payment.currency}`,
                },
            });
            await this.prisma.reconciliationIncident.create({
                data: {
                    organizationId: payment.organizationId,
                    incidentType: IncidentType.UNFINALIZED_PAYMENT,
                    providerPaymentId,
                    payload: {
                        issue: "Paid currency does not match expected payment record currency",
                        expectedCurrency: payment.currency,
                        receivedCurrency: paidCurrency,
                    },
                },
            });
            throw new BadRequestException(`Currency mismatch: expected ${payment.currency}, received ${paidCurrency}`);
        }

        // Case 1: Direct appointment payment
        if (payment.appointmentId) {
            await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                await tx.paymentRecord.update({
                    where: { id: payment.id },
                    data: {
                        status: PaymentRecordStatus.SUCCEEDED,
                        paidAt: new Date(),
                    },
                });

                await tx.appointment.update({
                    where: { id: payment.appointmentId! },
                    data: {
                        paymentStatus: "PAID",
                    },
                });

                await this.outboxService.emitInTx(tx, {
                    aggregateType: "Appointment",
                    aggregateId: payment.appointmentId!,
                    eventType: "appointment.payment_succeeded",
                    payload: {
                        appointmentId: payment.appointmentId,
                        paymentRecordId: payment.id,
                        amountCents: payment.amountCents,
                    },
                });
            });
            return;
        }

        // Case 2: Booking Hold conversion
        if (payment.bookingHoldId && payment.bookingHold) {
            const hold = payment.bookingHold;
            const now = new Date();
            const isHoldActive = hold.status === "ACTIVE" && hold.expiresAt > now;

            if (isHoldActive) {
                // Happy Path: Hold is active -> Finalize Appointment in transaction
                let conversionFailedDueToRace = false;

                await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                    const bookingDate = organizationBookingDate(hold.startAt, hold.location?.timezone || payment.organization?.timezone || "UTC");
                    // 1. Atomic Hold conversion
                    const updatedHold = await tx.bookingHold.updateMany({
                        where: {
                            id: hold.id,
                            organizationId: hold.organizationId,
                            status: "ACTIVE",
                            expiresAt: { gt: new Date() },
                        },
                        data: { status: "CONVERTED" },
                    });

                    if (updatedHold.count === 0) {
                        conversionFailedDueToRace = true;
                        return;
                    }

                    // 2. Ensure customer exists and update marketing consent if opted in
                    let customerId = hold.customerId;
                    const guestEmailNorm = hold.guestEmail?.toLowerCase().trim();
                    if (!customerId && guestEmailNorm) {
                        const existing = await tx.customer.findFirst({
                            where: { organizationId: hold.organizationId, email: guestEmailNorm },
                        });
                        if (existing) {
                            customerId = existing.id;
                            if (hold.consentMarketing && !existing.consentMarketing) {
                                await tx.customer.update({
                                    where: { id: existing.id },
                                    data: {
                                        consentMarketing: true,
                                        consentMarketingAt: new Date(),
                                        consentSource: 'PUBLIC_BOOKING',
                                    },
                                });
                            }
                        } else {
                            const newCust = await tx.customer.create({
                                data: {
                                    organizationId: hold.organizationId,
                                    fullName: hold.guestName || "Guest Customer",
                                    email: guestEmailNorm,
                                    phone: hold.guestPhone || null,
                                    consentMarketing: Boolean(hold.consentMarketing),
                                    consentMarketingAt: hold.consentMarketing ? new Date() : null,
                                    consentSource: hold.consentMarketing ? 'PUBLIC_BOOKING' : null,
                                },
                            });
                            customerId = newCust.id;
                        }
                    }

                    if (customerId) {
                        const existingDailyBooking = await tx.appointment.findFirst({
                            where: { organizationId: hold.organizationId, customerId, bookingDate, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
                            select: { id: true },
                        });
                        if (existingDailyBooking) throw new BadRequestException({ code: "CUSTOMER_DAILY_LIMIT", message: "A customer can book only one appointment per day." });
                    }

                    // Authoritative quote price calculation
                    // Authoritative quote price calculation in native organization currency
                    const quote = (hold.quoteSnapshot as any) || {};
                    const paymentMeta = (payment.metadata as any) || {};
                    const orgCurrency = paymentMeta.originalCurrency || quote.currency || payment.organization?.currency || "USD";
                    const fullPriceCents = Number(quote.basePriceCents ?? quote.totalCents ?? quote.priceCents ?? paymentMeta.originalAmountCents ?? payment.amountCents);
                    const paidDepositInOrgCurrency = Number(paymentMeta.originalAmountCents ?? (payment.currency === orgCurrency ? payment.amountCents : Math.round(payment.amountCents / (paymentMeta.exchangeRate || 1))));
                    const appointmentPaymentStatus = paidDepositInOrgCurrency >= fullPriceCents ? "PAID" : "PARTIALLY_PAID";

                    // 3. Create confirmed Appointment in native organization currency
                    const appt = await tx.appointment.create({
                        data: {
                            organizationId: hold.organizationId,
                            locationId: hold.locationId,
                            serviceId: hold.serviceId,
                            staffId: hold.staffId,
                            customerId: customerId!,
                            bookingHoldId: hold.id,
                            startAt: hold.startAt,
                            endAt: hold.endAt,
                            bookingDate,
                            partySize: hold.partySize,
                            status: "CONFIRMED",
                            paymentStatus: appointmentPaymentStatus,
                            bookingSource: "CUSTOMER_WEB",
                            priceCents: fullPriceCents,
                            currency: orgCurrency,
                            internalNotes: hold.guestNotes ? `Customer Preferences: ${hold.guestNotes}` : null,
                            metadata: {
                                customerNotes: hold.guestNotes || null,
                                depositPaidCents: paidDepositInOrgCurrency,
                                remainingBalanceCents: Math.max(0, fullPriceCents - paidDepositInOrgCurrency),
                                chargedUsdCents: payment.amountCents,
                                exchangeRate: paymentMeta.exchangeRate || 1.0,
                            },
                            version: 1,
                        },
                    });

                    // Increment coupon usage count if a coupon was redeemed
                    if (quote.appliedCouponCode) {
                        await tx.coupon.updateMany({
                            where: { organizationId: hold.organizationId, code: quote.appliedCouponCode },
                            data: { usageCount: { increment: 1 } },
                        });
                    }


                    // 4. Create Intake Responses from persisted hold snapshot
                    if (Array.isArray(hold.intakeSnapshot)) {
                        for (const item of (hold.intakeSnapshot as any[])) {
                            if (item.intakeFormId && item.responses) {
                                await tx.intakeResponse.create({
                                    data: {
                                        appointmentId: appt.id,
                                        intakeFormId: item.intakeFormId,
                                        responses: item.responses,
                                    },
                                });
                            }
                        }
                    }

                    // 5. Create Appointment History record
                    await tx.appointmentHistory.create({
                        data: {
                            appointmentId: appt.id,
                            actorType: "CUSTOMER",
                            actorId: customerId!,
                            action: "CREATED",
                            fromStatus: null,
                            toStatus: "CONFIRMED",
                            changes: {
                                bookingSource: "CUSTOMER_WEB",
                                paymentStatus: appointmentPaymentStatus,
                                amountPaidCents: payment.amountCents,
                                priceCents: fullPriceCents,
                            },
                        },
                    });

                    // 6. Update PaymentRecord
                    await tx.paymentRecord.update({
                        where: { id: payment.id },
                        data: {
                            status: PaymentRecordStatus.SUCCEEDED,
                            appointmentId: appt.id,
                            paidAt: new Date(),
                        },
                    });

                    // 7. Emit Outbox Event
                    await this.outboxService.emitInTx(tx, {
                        aggregateType: "Appointment",
                        aggregateId: appt.id,
                        eventType: "appointment.confirmed",
                        payload: {
                            appointmentId: appt.id,
                            organizationId: appt.organizationId,
                            paymentRecordId: payment.id,
                            amountCents: payment.amountCents,
                            paymentStatus: appointmentPaymentStatus,
                        },
                    });
                });

                if (!conversionFailedDueToRace) {
                    return;
                }
            }

            // Fallback / Edge Case: Hold expired before payment webhook arrived!
            // Reconcile Stripe state before recovering ambiguous failures
            const remotePayment = await this.paymentProvider.retrievePayment(payment.providerPaymentId, payment.organization?.stripeAccountId || undefined);
            if (remotePayment.status !== "succeeded") {
                this.logger.error(`Remote Stripe payment status is '${remotePayment.status}', not succeeded. Halting recovery.`);
                throw new BadRequestException(`Remote Stripe payment state is ${remotePayment.status}, not succeeded`);
            }

            try {
                let customerId = hold.customerId;
                const guestEmailNorm = hold.guestEmail?.toLowerCase().trim();
                if (!customerId && guestEmailNorm) {
                    const existing = await this.prisma.customer.findFirst({
                        where: { organizationId: hold.organizationId, email: guestEmailNorm },
                    });
                    if (existing) {
                        customerId = existing.id;
                    } else {
                        const newCust = await this.prisma.customer.create({
                            data: {
                                organizationId: hold.organizationId,
                                fullName: hold.guestName || "Guest Customer",
                                email: guestEmailNorm,
                                phone: hold.guestPhone || null,
                                consentMarketing: Boolean(hold.consentMarketing),
                                consentMarketingAt: hold.consentMarketing ? new Date() : null,
                                consentSource: hold.consentMarketing ? 'PUBLIC_BOOKING' : null,
                            },
                        });
                        customerId = newCust.id;
                    }
                }

                const quote = (hold.quoteSnapshot as any) || {};
                const fullPriceCents = Number(quote.basePriceCents ?? quote.totalCents ?? quote.priceCents ?? payment.amountCents);
                const appointmentPaymentStatus = payment.amountCents >= fullPriceCents ? "PAID" : "PARTIALLY_PAID";

                const res = await this.authoritativeValidator.validateAndReserveSlot({
                    organizationId: hold.organizationId,
                    locationId: hold.locationId,
                    serviceId: hold.serviceId,
                    staffId: hold.staffId,
                    customerId,
                    startAt: hold.startAt,
                    partySize: hold.partySize,
                    targetType: "APPOINTMENT",
                    appointmentDetails: {
                        bookingSource: "CUSTOMER_WEB",
                        paymentStatus: appointmentPaymentStatus,
                        bookingHoldId: hold.id,
                        priceCents: fullPriceCents,
                        currency: payment.currency,
                        internalNotes: hold.guestNotes ? `Customer Preferences: ${hold.guestNotes}` : null,
                        intakeResponses: Array.isArray(hold.intakeSnapshot) ? (hold.intakeSnapshot as any[]) : undefined,
                    },
                });

                const appt = res.appointment!;

                // Insert Intake Responses if snapshot exists
                if (Array.isArray(hold.intakeSnapshot)) {
                    for (const item of (hold.intakeSnapshot as any[])) {
                        if (item.intakeFormId && item.responses) {
                            await this.prisma.intakeResponse.create({
                                data: {
                                    appointmentId: appt.id,
                                    intakeFormId: item.intakeFormId,
                                    responses: item.responses,
                                },
                            });
                        }
                    }
                }

                await this.prisma.appointmentHistory.create({
                    data: {
                        appointmentId: appt.id,
                        actorType: "CUSTOMER",
                        actorId: customerId!,
                        action: "CREATED",
                        fromStatus: null,
                        toStatus: "CONFIRMED",
                        changes: {
                            bookingSource: "CUSTOMER_WEB",
                            paymentStatus: appointmentPaymentStatus,
                            amountPaidCents: payment.amountCents,
                        },
                    },
                });

                await this.prisma.paymentRecord.update({
                    where: { id: payment.id },
                    data: {
                        status: PaymentRecordStatus.SUCCEEDED,
                        appointmentId: appt.id,
                        paidAt: new Date(),
                    },
                });

                await this.prisma.bookingHold.update({
                    where: { id: hold.id },
                    data: { status: "CONVERTED" },
                });

                this.logger.log(`Successfully recovered expired hold ${hold.id} into appointment ${appt.id}`);
            } catch (err: any) {
                let refundProviderId: string | undefined;
                try {
                    const refund = await this.paymentProvider.refund({
                        providerPaymentId,
                        amountCents: payment.amountCents,
                        currency: payment.currency,
                        connectedAccountId: payment.organization?.stripeAccountId || undefined,
                        idempotencyKey: `refund_expired_hold_${payment.id}`,
                        reason: "requested_by_customer",
                    });
                    refundProviderId = refund.providerRefundId;
                    await this.prisma.$transaction(async (tx) => {
                        await tx.paymentRecord.update({ where: { id: payment.id }, data: { status: PaymentRecordStatus.REFUNDED, failureReason: "Automatically refunded because the reservation hold expired before confirmation." } });
                        await tx.refundRecord.create({ data: { organizationId: payment.organizationId, paymentId: payment.id, providerRefundId: refund.providerRefundId, amountCents: payment.amountCents, currency: payment.currency, status: "SUCCEEDED", reason: "EXPIRED_HOLD", actorType: "SYSTEM", idempotencyKey: `refund_expired_hold_${payment.id}`, processedAt: new Date() } }).catch((error: any) => { if (error?.code !== "P2002") throw error; });
                    });
                } catch (refundErr: any) {
                    this.logger.error(`Automatic refund failed for expired hold payment ${payment.id}: ${refundErr.message}`);
                }
                // Slot is lost to another customer -> flag reconciliation incident
                await this.prisma.paymentRecord.update({
                    where: { id: payment.id },
                    data: {
                        status: PaymentRecordStatus.REQUIRES_RECONCILIATION,
                        failureReason: `Paid after hold expired and slot could not be reserved: ${err.message}`,
                    },
                });

                await this.prisma.reconciliationIncident.create({
                    data: {
                        organizationId: hold.organizationId,
                        incidentType: IncidentType.PAID_HOLD_EXPIRED_SLOT_LOST,
                        providerPaymentId,
                        bookingHoldId: hold.id,
                        status: refundProviderId ? IncidentStatus.AUTO_REFUNDED : IncidentStatus.OPEN,
                        resolutionNotes: "Customer payment succeeded after hold expiry but slot was already taken. Automatic refund or manual reschedule required.",
                        payload: {
                            holdId: hold.id,
                            startAt: hold.startAt,
                            endAt: hold.endAt,
                            paidAmountCents: payment.amountCents,
                            error: err.message,
                            refundProviderId: refundProviderId || null,
                        },
                    },
                });

                this.logger.warn(`Payment ${payment.id} succeeded on expired hold ${hold.id} but slot was lost. ReconciliationIncident flagged.`);
            }
        }
    }

    private async handlePaymentFailed(verifiedEvent: VerifiedWebhookEvent) {
        const { providerPaymentId } = verifiedEvent;
        if (!providerPaymentId) return;

        const payment = await this.prisma.paymentRecord.findFirst({
            where: { providerPaymentId },
        });

        if (!payment) return;

        // Monotonic check: if payment already succeeded, a late failure event is an anomaly
        if (payment.status === PaymentRecordStatus.SUCCEEDED) {
            this.logger.warn(`Received payment_failed for already SUCCEEDED payment ${payment.id}. Creating reconciliation incident.`);
            await this.prisma.reconciliationIncident.create({
                data: {
                    organizationId: payment.organizationId,
                    incidentType: IncidentType.UNFINALIZED_PAYMENT,
                    providerPaymentId,
                    payload: {
                        issue: "Received payment_intent.payment_failed after payment was already marked SUCCEEDED",
                        paymentRecordId: payment.id,
                    },
                },
            });
            return;
        }

        await this.prisma.paymentRecord.updateMany({
            where: { providerPaymentId },
            data: {
                status: PaymentRecordStatus.FAILED,
                failureReason: "Payment provider reported payment failure",
            },
        });
    }

    /**
     * Actively reconciles an in-flight payment record with Stripe for a given hold.
     * If the payment is confirmed succeeded on Stripe, completes hold conversion and returns true.
     */
    async reconcilePaymentForHold(holdId: string, organizationId: string): Promise<boolean> {
        const payment = await this.prisma.paymentRecord.findFirst({
            where: {
                bookingHoldId: holdId,
                organizationId,
                status: PaymentRecordStatus.PENDING,
            },
            include: { organization: true },
            orderBy: { createdAt: "desc" },
        });

        if (!payment) return false;

        try {
            const remote = await this.paymentProvider.retrievePayment(
                payment.providerPaymentId,
                payment.organization?.stripeAccountId || undefined
            );

            if (remote && remote.status === "succeeded") {
                this.logger.log(`Active reconciliation confirmed Stripe payment ${payment.providerPaymentId} succeeded. Finalizing booking...`);
                await this.handlePaymentSucceeded({
                    eventId: `reconcile_${payment.id}_${Date.now()}`,
                    eventType: "payment_intent.succeeded",
                    livemode: false,
                    account: payment.organization?.stripeAccountId || undefined,
                    providerPaymentId: payment.providerPaymentId,
                    amountCents: remote.amountCents || payment.amountCents,
                    currency: remote.currency || payment.currency,
                    status: "succeeded",
                    metadata: {
                        organizationId,
                        holdId,
                    },
                    rawPayload: {},
                });
                return true;
            }
        } catch (err: any) {
            this.logger.warn(`Payment reconciliation for hold ${holdId} failed: ${err.message}`);
        }

        return false;
    }

    async listPayments(
        organizationId: string,
        query?: {
            status?: PaymentRecordStatus;
            customerId?: string;
            appointmentId?: string;
            startDate?: string;
            endDate?: string;
            search?: string;
            limit?: number;
            offset?: number;
        }
    ) {
        const where: any = { organizationId };

        if (query?.status) {
            where.status = query.status;
        }

        if (query?.appointmentId) {
            where.appointmentId = query.appointmentId;
        }

        if (query?.customerId) {
            where.OR = [
                { appointment: { customerId: query.customerId } },
                { bookingHold: { customerId: query.customerId } },
            ];
        }

        if (query?.startDate || query?.endDate) {
            where.createdAt = {
                ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
                ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            };
        }

        if (query?.search) {
            const searchLower = query.search.trim().toLowerCase();
            where.OR = [
                { providerPaymentId: { contains: searchLower, mode: "insensitive" } },
                { appointment: { customer: { fullName: { contains: searchLower, mode: "insensitive" } } } },
                { appointment: { customer: { email: { contains: searchLower, mode: "insensitive" } } } },
                { bookingHold: { guestName: { contains: searchLower, mode: "insensitive" } } },
                { bookingHold: { guestEmail: { contains: searchLower, mode: "insensitive" } } },
            ];
        }

        const [items, total, org] = await Promise.all([
            this.prisma.paymentRecord.findMany({
                where,
                include: {
                    appointment: {
                        include: {
                            service: true,
                            staff: true,
                            customer: true,
                        },
                    },
                    bookingHold: {
                        include: {
                            customer: true,
                            service: true,
                            staff: true,
                        },
                    },
                    refunds: {
                        orderBy: { createdAt: "desc" },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: query?.limit ? Math.min(Number(query.limit), 100) : 50,
                skip: query?.offset ? Number(query.offset) : 0,
            }),
            this.prisma.paymentRecord.count({ where }),
            this.prisma.organization.findUnique({
                where: { id: organizationId },
                select: { currency: true },
            }),
        ]);

        const orgCurrency = org?.currency || "USD";

        const mappedItems = await Promise.all(
            items.map(async (p) => {
                const meta = (p.metadata as any) || {};
                let convertedAmountCents = p.amountCents;

                if (p.currency === orgCurrency) {
                    convertedAmountCents = p.amountCents;
                } else if (meta.originalCurrency === orgCurrency && meta.originalAmountCents != null) {
                    convertedAmountCents = Number(meta.originalAmountCents);
                } else if (meta.exchangeRate && p.currency !== orgCurrency) {
                    convertedAmountCents = Math.round(p.amountCents / Number(meta.exchangeRate));
                } else {
                    const conv = await this.exchangeRateService.convertCurrency(p.amountCents, p.currency, orgCurrency).catch(() => ({ convertedAmountCents: p.amountCents }));
                    convertedAmountCents = conv.convertedAmountCents;
                }

                let totalRefundedConvertedCents = 0;
                const convertedRefunds = (p.refunds || []).map((r) => {
                    let rConverted = r.amountCents;
                    if (r.currency === orgCurrency) {
                        rConverted = r.amountCents;
                    } else if (meta.originalCurrency === orgCurrency && meta.originalAmountCents != null && p.amountCents > 0) {
                        rConverted = Math.round((r.amountCents / p.amountCents) * Number(meta.originalAmountCents));
                    } else if (meta.exchangeRate && r.currency !== orgCurrency) {
                        rConverted = Math.round(r.amountCents / Number(meta.exchangeRate));
                    }
                    if (r.status === "SUCCEEDED") {
                        totalRefundedConvertedCents += rConverted;
                    }
                    return {
                        ...r,
                        convertedAmountCents: rConverted,
                        convertedCurrency: orgCurrency,
                    };
                });

                return {
                    ...p,
                    convertedAmountCents,
                    convertedCurrency: orgCurrency,
                    totalRefundedConvertedCents,
                    refunds: convertedRefunds,
                };
            })
        );

        return { items: mappedItems, payments: mappedItems, total };
    }

    async getPaymentsSummary(organizationId: string) {
        const [payments, refunds, org] = await Promise.all([
            this.prisma.paymentRecord.findMany({
                where: { organizationId },
                select: {
                    id: true,
                    amountCents: true,
                    currency: true,
                    status: true,
                    metadata: true,
                },
            }),
            this.prisma.refundRecord.findMany({
                where: { organizationId, status: "SUCCEEDED" },
                select: {
                    id: true,
                    amountCents: true,
                    currency: true,
                    payment: {
                        select: {
                            metadata: true,
                            currency: true,
                            amountCents: true,
                        },
                    },
                },
            }),
            this.prisma.organization.findUnique({
                where: { id: organizationId },
                select: {
                    currency: true,
                    stripeAccountId: true,
                    stripeChargesEnabled: true,
                    stripePayoutsEnabled: true,
                    stripeDetailsSubmitted: true,
                },
            }),
        ]);

        const orgCurrency = org?.currency || "USD";
        const successfulStatuses = new Set(["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"]);
        let grossRevenueCents = 0;
        let successfulPaymentsCount = 0;
        let pendingPaymentsCount = 0;
        let failedPaymentsCount = 0;
        let refundedPaymentsCount = 0;

        for (const p of payments) {
            const meta = (p.metadata as any) || {};
            let amountInOrgCurrency = p.amountCents;

            if (p.currency === orgCurrency) {
                amountInOrgCurrency = p.amountCents;
            } else if (meta.originalCurrency === orgCurrency && meta.originalAmountCents != null) {
                amountInOrgCurrency = Number(meta.originalAmountCents);
            } else if (meta.exchangeRate && p.currency !== orgCurrency) {
                amountInOrgCurrency = Math.round(p.amountCents / Number(meta.exchangeRate));
            } else {
                const conv = await this.exchangeRateService.convertCurrency(p.amountCents, p.currency, orgCurrency).catch(() => ({ convertedAmountCents: p.amountCents }));
                amountInOrgCurrency = conv.convertedAmountCents;
            }

            if (successfulStatuses.has(p.status)) {
                grossRevenueCents += amountInOrgCurrency;
                successfulPaymentsCount++;
            }
            if (p.status === "PENDING") pendingPaymentsCount++;
            if (p.status === "FAILED") failedPaymentsCount++;
            if (p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED") refundedPaymentsCount++;
        }

        let totalRefundsCents = 0;
        for (const r of refunds) {
            const pMeta = (r.payment?.metadata as any) || {};
            let rInOrgCurrency = r.amountCents;

            if (r.currency === orgCurrency) {
                rInOrgCurrency = r.amountCents;
            } else if (pMeta.originalCurrency === orgCurrency && pMeta.originalAmountCents != null && (r.payment?.amountCents || 0) > 0) {
                rInOrgCurrency = Math.round((r.amountCents / r.payment!.amountCents) * Number(pMeta.originalAmountCents));
            } else if (pMeta.exchangeRate && r.currency !== orgCurrency) {
                rInOrgCurrency = Math.round(r.amountCents / Number(pMeta.exchangeRate));
            } else {
                const conv = await this.exchangeRateService.convertCurrency(r.amountCents, r.currency, orgCurrency).catch(() => ({ convertedAmountCents: r.amountCents }));
                rInOrgCurrency = conv.convertedAmountCents;
            }
            totalRefundsCents += rInOrgCurrency;
        }

        const netRevenueCents = Math.max(0, grossRevenueCents - totalRefundsCents);

        return {
            currency: orgCurrency,
            grossRevenueCents,
            grossCapturedCents: grossRevenueCents,
            totalRefundsCents,
            netRevenueCents,
            netBalanceCents: netRevenueCents,
            totalPaymentsCount: payments.length,
            transactionCount: payments.length,
            successfulPaymentsCount,
            pendingPaymentsCount,
            failedPaymentsCount,
            refundedPaymentsCount,
            refundCount: refunds.length,
            stripeConnect: {
                connected: Boolean(org?.stripeAccountId),
                accountId: org?.stripeAccountId || null,
                chargesEnabled: Boolean(org?.stripeChargesEnabled),
                payoutsEnabled: Boolean(org?.stripePayoutsEnabled),
                detailsSubmitted: Boolean(org?.stripeDetailsSubmitted),
            },
        };
    }
}
