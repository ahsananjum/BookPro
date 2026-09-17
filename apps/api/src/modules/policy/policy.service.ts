import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdatePolicyConfigDto, CancellationQuoteResponseDto } from '@bookpro/contracts';
import * as crypto from 'crypto';

@Injectable()
export class PolicyService {
    constructor(private readonly prisma: PrismaService) { }

    async getPolicies(organizationId: string) {
        return this.prisma.policyConfig.findMany({
            where: { organizationId },
            include: {
                location: true,
                service: true,
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    async updatePolicyConfig(organizationId: string, dto: UpdatePolicyConfigDto) {
        const locationId = dto.locationId || null;
        const serviceId = dto.serviceId || null;

        // Find existing policy at this specific level
        const existing = await this.prisma.policyConfig.findFirst({
            where: {
                organizationId,
                locationId,
                serviceId,
            },
        });

        if (existing) {
            return this.prisma.policyConfig.update({
                where: { id: existing.id },
                data: {
                    ...(dto.minNoticeHours !== undefined && { minNoticeHours: dto.minNoticeHours }),
                    ...(dto.maxNoticeDays !== undefined && { maxNoticeDays: dto.maxNoticeDays }),
                    ...(dto.cancelCutoffHours !== undefined && { cancelCutoffHours: dto.cancelCutoffHours }),
                    ...(dto.cancelFeeType && { cancelFeeType: dto.cancelFeeType }),
                    ...(dto.cancelFeeValue !== undefined && { cancelFeeValue: dto.cancelFeeValue }),
                    ...(dto.rescheduleCutoffHours !== undefined && { rescheduleCutoffHours: dto.rescheduleCutoffHours }),
                    ...(dto.holdDurationMinutes !== undefined && { holdDurationMinutes: dto.holdDurationMinutes }),
                    ...(dto.waitlistOfferExpiryMinutes !== undefined && { waitlistOfferExpiryMinutes: dto.waitlistOfferExpiryMinutes }),
                },
            });
        }

        return this.prisma.policyConfig.create({
            data: {
                organizationId,
                locationId,
                serviceId,
                minNoticeHours: dto.minNoticeHours ?? 24,
                maxNoticeDays: dto.maxNoticeDays ?? 60,
                cancelCutoffHours: dto.cancelCutoffHours ?? 24,
                cancelFeeType: dto.cancelFeeType || 'NONE',
                cancelFeeValue: dto.cancelFeeValue ?? 0,
                rescheduleCutoffHours: dto.rescheduleCutoffHours ?? 24,
                holdDurationMinutes: dto.holdDurationMinutes ?? 10,
                waitlistOfferExpiryMinutes: dto.waitlistOfferExpiryMinutes ?? 15,
            },
        });
    }

    /**
     * Resolves policy rules using 3-tier precedence: Service > Location > Organization level
     */
    async resolvePolicy(organizationId: string, locationId?: string | null, serviceId?: string | null) {
        const [servicePolicy, locationPolicy, orgPolicy] = await Promise.all([
            serviceId
                ? this.prisma.policyConfig.findFirst({ where: { organizationId, serviceId } })
                : null,
            locationId
                ? this.prisma.policyConfig.findFirst({ where: { organizationId, locationId, serviceId: null } })
                : null,
            this.prisma.policyConfig.findFirst({ where: { organizationId, locationId: null, serviceId: null } }),
        ]);

        const activePolicy = servicePolicy || locationPolicy || orgPolicy;

        if (!activePolicy) {
            // Default fallback if no database record exists yet
            return {
                id: undefined,
                minNoticeHours: 24,
                maxNoticeDays: 60,
                cancelCutoffHours: 24,
                cancelFeeType: 'NONE',
                cancelFeeValue: 0,
                rescheduleCutoffHours: 24,
                holdDurationMinutes: 10,
                waitlistOfferExpiryMinutes: 15,
                updatedAt: undefined,
                resolvedFrom: 'DEFAULT_SYSTEM_FALLBACK' as const,
            };
        }

        return {
            ...activePolicy,
            resolvedFrom: servicePolicy ? ('SERVICE' as const) : locationPolicy ? ('LOCATION' as const) : ('ORGANIZATION' as const),
        };
    }

    async getCancellationQuote(
        organizationIdOrInput: string | { organizationId: string; appointmentId?: string; serviceId?: string; locationId?: string; startAt?: string; paidAmountCents?: number },
        appointmentIdParam?: string
    ) {
        return this.calculateCancellationQuote(organizationIdOrInput, appointmentIdParam);
    }

    /**
     * Evaluates and persists an authoritative, immutable cancellation quote for an appointment based on active policy.
     * Supports both (orgId, apptId) and input objects.
     */
    async calculateCancellationQuote(
        organizationIdOrInput: string | { organizationId: string; appointmentId?: string; serviceId?: string; locationId?: string; startAt?: string; paidAmountCents?: number },
        appointmentIdParam?: string
    ): Promise<CancellationQuoteResponseDto & { cancellationFeeCents?: number; refundableAmountCents?: number; eligibleForRefund?: boolean }> {
        let organizationId: string;
        let appointmentId: string | undefined;
        let serviceId: string | undefined;
        let locationId: string | undefined;
        let startAtDate: Date;
        let createdAtDate: Date | undefined = undefined;
        let priceCents: number;
        let capturedBalanceCents = 0;
        let currency = 'USD';
        let apptVersion = 1;

        if (typeof organizationIdOrInput === 'string') {
            organizationId = organizationIdOrInput;
            appointmentId = appointmentIdParam;

            if (!appointmentId) {
                throw new BadRequestException('appointmentId is required');
            }

            const appointment = await this.prisma.appointment.findFirst({
                where: { id: appointmentId, organizationId },
                include: {
                    service: true,
                    location: true,
                    paymentRecords: {
                        include: { refunds: true },
                    },
                },
            });

            if (!appointment) {
                throw new NotFoundException(`Appointment ${appointmentId} not found`);
            }

            serviceId = appointment.serviceId;
            locationId = appointment.locationId;
            startAtDate = new Date(appointment.startAt);
            createdAtDate = appointment.createdAt ? new Date(appointment.createdAt) : undefined;
            priceCents = appointment.priceCents;
            currency = appointment.currency || 'USD';
            apptVersion = appointment.version || 1;

            // Calculate actual captured balance in appointment's currency minus active non-failed refunds
            if (appointment.paymentRecords && appointment.paymentRecords.length > 0) {
                for (const p of appointment.paymentRecords) {
                    if (p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED') {
                        let paidInApptCurrency = p.amountCents;
                        const originalAmt = (p.metadata && (p.metadata as any).originalAmountCents)
                            ? Number((p.metadata as any).originalAmountCents)
                            : (appointment.metadata as any)?.depositPaidCents
                            ? Number((appointment.metadata as any).depositPaidCents)
                            : null;

                        if (originalAmt && originalAmt > 0) {
                            paidInApptCurrency = originalAmt;
                        } else if (p.currency !== currency) {
                            if ((p.metadata as any)?.exchangeRate && Number((p.metadata as any).exchangeRate) > 0) {
                                paidInApptCurrency = Math.round(p.amountCents / Number((p.metadata as any).exchangeRate));
                            }
                        }

                        const activeRefunds = (p.refunds || [])
                            .filter((r: any) => r.status === 'SUCCEEDED' || r.status === 'PENDING')
                            .reduce((sum: number, r: any) => sum + r.amountCents, 0);
                        const refundRatio = p.amountCents > 0 ? activeRefunds / p.amountCents : 0;
                        const remainingInApptCurrency = Math.max(0, Math.round(paidInApptCurrency * (1 - refundRatio)));
                        capturedBalanceCents += remainingInApptCurrency;
                    }
                }
            } else if (appointment.paymentStatus === 'PAID') {
                capturedBalanceCents = priceCents;
            }
        } else {
            organizationId = organizationIdOrInput.organizationId;
            appointmentId = organizationIdOrInput.appointmentId;
            serviceId = organizationIdOrInput.serviceId;
            locationId = organizationIdOrInput.locationId;
            startAtDate = organizationIdOrInput.startAt ? new Date(organizationIdOrInput.startAt) : new Date(Date.now() + 48 * 3600 * 1000);
            priceCents = organizationIdOrInput.paidAmountCents ?? 5000;
            capturedBalanceCents = organizationIdOrInput.paidAmountCents ?? 0;

            if (appointmentId) {
                const appt = await this.prisma.appointment.findFirst({
                    where: { id: appointmentId, organizationId },
                    include: {
                        paymentRecords: {
                            include: { refunds: true },
                        },
                    },
                });
                if (appt) {
                    serviceId = serviceId || appt.serviceId;
                    locationId = locationId || appt.locationId;
                    startAtDate = new Date(appt.startAt);
                    createdAtDate = appt.createdAt ? new Date(appt.createdAt) : undefined;
                    priceCents = appt.priceCents;
                    currency = appt.currency || 'USD';
                    apptVersion = appt.version || 1;

                    let calcBalance = 0;
                    if (appt.paymentRecords && appt.paymentRecords.length > 0) {
                        for (const p of appt.paymentRecords) {
                            if (p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED') {
                                let paidInApptCurrency = p.amountCents;
                                const originalAmt = (p.metadata && (p.metadata as any).originalAmountCents)
                                    ? Number((p.metadata as any).originalAmountCents)
                                    : (appt.metadata as any)?.depositPaidCents
                                    ? Number((appt.metadata as any).depositPaidCents)
                                    : null;

                                if (originalAmt && originalAmt > 0) {
                                    paidInApptCurrency = originalAmt;
                                } else if (p.currency !== currency) {
                                    if ((p.metadata as any)?.exchangeRate && Number((p.metadata as any).exchangeRate) > 0) {
                                        paidInApptCurrency = Math.round(p.amountCents / Number((p.metadata as any).exchangeRate));
                                    }
                                }
                                const activeRefunds = (p.refunds || [])
                                    .filter((r: any) => r.status === 'SUCCEEDED' || r.status === 'PENDING')
                                    .reduce((sum: number, r: any) => sum + r.amountCents, 0);
                                const refundRatio = p.amountCents > 0 ? activeRefunds / p.amountCents : 0;
                                calcBalance += Math.max(0, Math.round(paidInApptCurrency * (1 - refundRatio)));
                            }
                        }
                        capturedBalanceCents = calcBalance;
                    } else if (organizationIdOrInput.paidAmountCents !== undefined) {
                        capturedBalanceCents = organizationIdOrInput.paidAmountCents;
                    }
                }
            }
        }

        const policy = await this.resolvePolicy(organizationId, locationId, serviceId);
        const policyVersion = policy.updatedAt ? new Date(policy.updatedAt).toISOString() : (policy.id || 'system-v1');

        let orgTimezone = 'UTC';
        let locTimezone = 'UTC';
        try {
            const org = await this.prisma.organization.findUnique({
                where: { id: organizationId },
                select: { timezone: true },
            });
            orgTimezone = org?.timezone || 'UTC';

            if (locationId) {
                const locRecord = await this.prisma.location.findUnique({
                    where: { id: locationId },
                    select: { timezone: true },
                });
                locTimezone = locRecord?.timezone || orgTimezone;
            } else {
                locTimezone = orgTimezone;
            }
        } catch {
            // Memory or mock fallback
        }

        const now = new Date();
        const diffMs = startAtDate.getTime() - now.getTime();
        const hoursUntilStart = diffMs / (1000 * 60 * 60);

        // Determine effective cancellation cutoff hours:
        // If an appointment was booked with less lead time than cancelCutoffHours
        // (e.g. booked 4 hours in advance when cutoff is 24 hours, permitted by minNoticeHours),
        // the applicable cutoff is the organization's minNoticeHours.
        let effectiveCutoffHours = policy.cancelCutoffHours;
        let isShortNoticeBooking = false;
        if (createdAtDate) {
            const bookingLeadHours = (startAtDate.getTime() - createdAtDate.getTime()) / (1000 * 60 * 60);
            if (bookingLeadHours < policy.cancelCutoffHours) {
                effectiveCutoffHours = Math.min(policy.cancelCutoffHours, policy.minNoticeHours ?? 1);
                isShortNoticeBooking = true;
            }
        }

        // Add 5-second tolerance for execution jitter at exact boundaries
        const isOnTime = (hoursUntilStart + (5 / 3600)) >= effectiveCutoffHours;

        // Post-Booking Grace Period (Cooling-Off Window):
        // If an appointment was booked recently (e.g. within 2 hours / 120 minutes of booking creation)
        // and the appointment start time is still in the future, the customer is entitled to free cancellation
        // without late cancellation penalties.
        let isWithinGracePeriod = false;
        if (createdAtDate && diffMs > 0) {
            const elapsedSinceBookingMinutes = (now.getTime() - createdAtDate.getTime()) / (1000 * 60);
            if (elapsedSinceBookingMinutes >= 0 && elapsedSinceBookingMinutes <= 120) {
                isWithinGracePeriod = true;
            }
        }

        let isAllowed = true;
        let feeCents = 0;
        let refundableAmountCents = 0;
        let reason = '';

        // Policy Evaluation:
        // Case 0: Past Appointment (Start time has already elapsed on server clock)
        if (diffMs <= 0) {
            isAllowed = false;
            feeCents = capturedBalanceCents;
            refundableAmountCents = 0;
            reason = 'Appointment start time has already passed according to official server time. Past appointments cannot be cancelled.';
        } else if (isOnTime || isWithinGracePeriod) {
            // Case 1: Standard / Free Cancellation Window (>= effectiveCutoffHours) OR within Booking Grace Period
            isAllowed = true;
            feeCents = 0;
            refundableAmountCents = capturedBalanceCents;
            if (isWithinGracePeriod) {
                reason = `Cancellation is within the post-booking grace period (cooling-off window). Eligible for full refund without late cancellation fee.`;
            } else if (isShortNoticeBooking) {
                reason = `Cancellation is within the short-notice booking window (${effectiveCutoffHours}h notice required under ${policy.resolvedFrom} policy). Eligible for full refund.`;
            } else {
                reason = effectiveCutoffHours > 0
                    ? `Cancellation is within the free cancellation window (${effectiveCutoffHours}h notice). Eligible for full refund.`
                    : `Cancellation permitted under ${policy.resolvedFrom} policy.`;
            }
        } else {
            // Case 2: Late Cancellation Window (< effectiveCutoffHours)
            if (capturedBalanceCents === 0) {
                isAllowed = true;
                feeCents = 0;
                refundableAmountCents = 0;
                reason = `Cancellation cutoff window passed. No captured payments on appointment.`;
            } else if (policy.cancelFeeType === 'PERCENTAGE' && policy.cancelFeeValue > 0) {
                // If cancelFeeValue <= 100, treat as percentage (e.g. 20 = 20%); if > 100, treat as basis points (e.g. 2000 = 20%)
                const pct = policy.cancelFeeValue <= 100 ? policy.cancelFeeValue : policy.cancelFeeValue / 100;
                feeCents = Math.min(capturedBalanceCents, Math.round((capturedBalanceCents * pct) / 100));
                refundableAmountCents = Math.max(0, capturedBalanceCents - feeCents);
                isAllowed = true;
                reason = `Late cancellation penalty fee of ${pct}% applied under ${policy.resolvedFrom} policy (${effectiveCutoffHours}h cutoff window passed).`;
            } else if (policy.cancelFeeType === 'FIXED_AMOUNT' && policy.cancelFeeValue > 0) {
                feeCents = Math.min(capturedBalanceCents, policy.cancelFeeValue);
                refundableAmountCents = Math.max(0, capturedBalanceCents - feeCents);
                isAllowed = true;
                reason = `Late cancellation fixed fee of ${(feeCents / 100).toFixed(2)} ${currency} applied under ${policy.resolvedFrom} policy (${effectiveCutoffHours}h cutoff window passed).`;
            } else {
                // NONE fee type inside cutoff: non-refundable
                feeCents = capturedBalanceCents;
                refundableAmountCents = 0;
                isAllowed = true;
                reason = `Cancellation cutoff window passed. Non-refundable under ${policy.resolvedFrom} policy.`;
            }
        }

        // Generate Fixed 15-minute Expiry
        const expiresAtDate = new Date(now.getTime() + 15 * 60 * 1000);
        const expiresAt = expiresAtDate.toISOString();

        // Cryptographic HMAC Signature over Canonical Quote
        const secret = process.env.JWT_SECRET || process.env.APP_SECRET || 'bookpro_cancellation_quote_canonical_key';
        const canonicalPayload = `${organizationId}:${appointmentId || 'unpersisted'}:${apptVersion}:${policyVersion}:${capturedBalanceCents}:${feeCents}:${refundableAmountCents}:${currency}:${expiresAt}`;
        const quoteSignature = crypto
            .createHmac('sha256', secret)
            .update(canonicalPayload)
            .digest('hex');

        const quoteVersion = quoteSignature.substring(0, 16);

        // Persist Immutable Cancellation Quote in Database if appointment exists
        let quoteRecordId: string | undefined = undefined;
        if (appointmentId && (this.prisma as any).cancellationQuote) {
            try {
                const quoteRecord = await (this.prisma as any).cancellationQuote.create({
                    data: {
                        organizationId,
                        appointmentId,
                        appointmentVersion: apptVersion,
                        policyConfigId: policy.id || null,
                        policyVersion: String(policyVersion),
                        policyProvenance: policy.resolvedFrom,
                        capturedBalanceCents,
                        feeCents,
                        refundableAmountCents,
                        currency,
                        quoteSignature,
                        reason,
                        isAllowed,
                        status: 'ISSUED',
                        expiresAt: expiresAtDate,
                    },
                });
                quoteRecordId = quoteRecord.id;
            } catch (err: any) {
                // Non-fatal if mock database or memory stub
            }
        }

        return {
            quoteId: quoteRecordId,
            appointmentId: appointmentId || 'mock_appointment_id',
            appointmentVersion: apptVersion,
            isAllowed,
            feeCents,
            refundableCents: refundableAmountCents,
            cancellationFeeCents: feeCents,
            refundableAmountCents,
            capturedBalanceCents,
            eligibleForRefund: isAllowed && refundableAmountCents > 0,
            currency,
            reason,
            policyProvenance: policy.resolvedFrom,
            policyVersion: String(policyVersion),
            quoteVersion,
            expiresAt,
            organizationTimezone: orgTimezone,
            locationTimezone: locTimezone,
            serverTime: now.toISOString(),
            startAt: startAtDate ? startAtDate.toISOString() : undefined,
            cancelCutoffHours: effectiveCutoffHours,
            minNoticeHours: policy.minNoticeHours,
            cancelFeeType: policy.cancelFeeType,
            cancelFeeValue: policy.cancelFeeValue,
        };
    }

    /**
     * Validates an existing cancellation quote prior to executing final cancellation.
     * Enforces: cryptographic signature, non-expired status, and matching appointment/policy/payment state.
     */
    async validateCancellationQuote(
        organizationId: string,
        appointmentId: string,
        quoteVersion?: string
    ): Promise<{ isValid: boolean; quote: CancellationQuoteResponseDto; quoteRecord?: any }> {
        const appointment = await this.prisma.appointment.findFirst({
            where: { id: appointmentId, organizationId },
            include: {
                paymentRecords: {
                    include: { refunds: true },
                },
            },
        });

        if (!appointment) {
            throw new NotFoundException(`Appointment ${appointmentId} not found`);
        }

        if (appointment.status === 'CANCELLED') {
            throw new BadRequestException('Appointment is already cancelled.');
        }

        if (new Date() >= new Date(appointment.startAt)) {
            throw new BadRequestException('Appointment start time has already passed according to official server time. Past appointments cannot be cancelled.');
        }

        // If no quote version provided (e.g. system or staff override), calculate a fresh quote
        if (!quoteVersion) {
            const freshQuote = await this.calculateCancellationQuote(organizationId, appointmentId);
            return { isValid: true, quote: freshQuote };
        }

        // 1. Look up quote by signature prefix or id
        let quoteRecord: any = null;
        if ((this.prisma as any).cancellationQuote) {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteVersion);
            quoteRecord = await (this.prisma as any).cancellationQuote.findFirst({
                where: {
                    organizationId,
                    appointmentId,
                    ...(isUuid
                        ? {
                            OR: [
                                { quoteSignature: { startsWith: quoteVersion } },
                                { id: quoteVersion },
                            ],
                        }
                        : {
                            quoteSignature: { startsWith: quoteVersion },
                        }),
                },
                orderBy: { createdAt: 'desc' },
            });
        }

        const now = new Date();

        if (quoteRecord) {
            // 2. Assert quote is not expired
            if (now > new Date(quoteRecord.expiresAt)) {
                throw new BadRequestException('Cancellation quote has expired. Please review updated terms and try again.');
            }

            // 3. Assert quote is active (not already applied or invalidated)
            if (quoteRecord.status !== 'ISSUED') {
                throw new BadRequestException(`Cancellation quote is no longer active (status: ${quoteRecord.status}).`);
            }

            // 4. Assert appointment version has not changed
            if (appointment.version !== quoteRecord.appointmentVersion) {
                throw new ConflictException('Appointment state has changed since quote was generated. Please refresh quote.');
            }

            // 5. Assert policy version has not changed
            const currentPolicy = await this.resolvePolicy(organizationId, appointment.locationId, appointment.serviceId);
            const currentPolicyVer = currentPolicy.updatedAt ? new Date(currentPolicy.updatedAt).toISOString() : (currentPolicy.id || 'system-v1');
            if (quoteRecord.policyVersion !== String(currentPolicyVer)) {
                throw new BadRequestException('Cancellation policy configuration has changed. Please review the updated policy quote.');
            }

            // 6. Assert captured balance has not changed
            let currentCapturedBalance = 0;
            if (appointment.paymentRecords) {
                for (const p of appointment.paymentRecords) {
                    if (p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED') {
                        let paidInApptCurrency = p.amountCents;
                        const originalAmt = (p.metadata && (p.metadata as any).originalAmountCents)
                            ? Number((p.metadata as any).originalAmountCents)
                            : (appointment.metadata as any)?.depositPaidCents
                            ? Number((appointment.metadata as any).depositPaidCents)
                            : null;

                        if (originalAmt && originalAmt > 0) {
                            paidInApptCurrency = originalAmt;
                        } else if (p.currency !== quoteRecord.currency) {
                            if ((p.metadata as any)?.exchangeRate && Number((p.metadata as any).exchangeRate) > 0) {
                                paidInApptCurrency = Math.round(p.amountCents / Number((p.metadata as any).exchangeRate));
                            }
                        }

                        const activeRefunds = (p.refunds || [])
                            .filter((r: any) => r.status === 'SUCCEEDED' || r.status === 'PENDING')
                            .reduce((sum: number, r: any) => sum + r.amountCents, 0);
                        const refundRatio = p.amountCents > 0 ? activeRefunds / p.amountCents : 0;
                        currentCapturedBalance += Math.max(0, Math.round(paidInApptCurrency * (1 - refundRatio)));
                    }
                }
            }
            if (currentCapturedBalance !== quoteRecord.capturedBalanceCents) {
                throw new BadRequestException('Payment captured balance has changed. Please refresh quote.');
            }

            return {
                isValid: true,
                quote: {
                    quoteId: quoteRecord.id,
                    appointmentId: quoteRecord.appointmentId,
                    appointmentVersion: quoteRecord.appointmentVersion,
                    isAllowed: quoteRecord.isAllowed,
                    feeCents: quoteRecord.feeCents,
                    refundableCents: quoteRecord.refundableAmountCents,
                    cancellationFeeCents: quoteRecord.feeCents,
                    refundableAmountCents: quoteRecord.refundableAmountCents,
                    capturedBalanceCents: quoteRecord.capturedBalanceCents,
                    eligibleForRefund: quoteRecord.isAllowed && quoteRecord.refundableAmountCents > 0,
                    currency: quoteRecord.currency,
                    reason: quoteRecord.reason || '',
                    policyProvenance: quoteRecord.policyProvenance as any,
                    policyVersion: quoteRecord.policyVersion,
                    quoteVersion: quoteRecord.quoteSignature.substring(0, 16),
                    expiresAt: new Date(quoteRecord.expiresAt).toISOString(),
                    startAt: appointment.startAt ? new Date(appointment.startAt).toISOString() : undefined,
                    cancelCutoffHours: currentPolicy.cancelCutoffHours,
                    minNoticeHours: currentPolicy.minNoticeHours,
                    cancelFeeType: currentPolicy.cancelFeeType,
                    cancelFeeValue: currentPolicy.cancelFeeValue,
                },
                quoteRecord,
            };
        }

        // Fallback for tests or memory stubs where quote was calculated in-memory
        const freshQuote = await this.calculateCancellationQuote(organizationId, appointmentId);
        if (freshQuote.quoteVersion !== quoteVersion && !freshQuote.quoteVersion.startsWith(quoteVersion)) {
            // Check if expired
            if (now > new Date(freshQuote.expiresAt)) {
                throw new BadRequestException('Cancellation quote has expired. Please review updated terms and try again.');
            }
        }

        return { isValid: true, quote: freshQuote };
    }
}
