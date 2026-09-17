import {
    Injectable,
    Logger,
    NotFoundException,
    ConflictException,
    BadRequestException,
    UnauthorizedException,
    Inject,
    Optional,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ScheduleGuardService } from '../concurrency/schedule-guard.service';
import { IdempotencyService } from '../common/idempotency.service';
import { OutboxService } from '../outbox/outbox.service';
import { PolicyService } from '../policy/policy.service';
import { PricingService } from '../pricing/pricing.service';
import { AuthoritativeAvailabilityValidatorService } from '../availability/authoritative-availability-validator.service';
import { BookingHold, PaymentRecordStatus, Prisma } from '@prisma/client';
import { PAYMENT_PROVIDER, PaymentProvider } from '../payments/payment-provider.interface';
import { CanonicalHoldReviewDto, PublicPersistHoldDetailsDto } from '@bookpro/contracts';
import * as crypto from 'crypto';

export interface CreateHoldInput {
    organizationId: string;
    locationId: string;
    serviceId: string;
    staffId?: string | null;
    customerId?: string | null;
    guestName?: string | null;
    guestEmail?: string | null;
    guestPhone?: string | null;
    startAt: string;
    endAt?: string;
    partySize?: number;
    idempotencyKey?: string | null;
    createdById?: string | null;
}

export type CreateHoldResult = BookingHold & {
    guestToken?: string;
};

@Injectable()
export class BookingHoldService {
    private readonly logger = new Logger(BookingHoldService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly scheduleGuardService: ScheduleGuardService,
        private readonly idempotencyService: IdempotencyService,
        private readonly outboxService: OutboxService,
        private readonly policyService: PolicyService,
        private readonly pricingService: PricingService,
        private readonly authoritativeValidator: AuthoritativeAvailabilityValidatorService,
        @Optional()
        @Inject(PAYMENT_PROVIDER)
        private readonly paymentProvider?: PaymentProvider,
    ) { }

    /**
     * Creates a durable BookingHold record under PostgreSQL ScheduleGuard pessimistic locking
     * using the single authoritative availability validator pipeline.
     */
    async createHold(input: CreateHoldInput): Promise<BookingHold> {
        const res = await this.idempotencyService.executeIdempotent<CreateHoldResult>(
            {
                organizationId: input.organizationId,
                operation: "HOLD_CREATE",
                idempotencyKey: input.idempotencyKey,
                payload: input,
            },
            async () => {
                const result = await this.authoritativeValidator.validateAndReserveSlot({
                    organizationId: input.organizationId,
                    locationId: input.locationId,
                    serviceId: input.serviceId,
                    staffId: input.staffId,
                    customerId: input.customerId,
                    startAt: input.startAt,
                    partySize: input.partySize ?? 1,
                    targetType: 'HOLD',
                    holdDetails: {
                        guestName: input.guestName,
                        guestEmail: input.guestEmail,
                        guestPhone: input.guestPhone,
                        idempotencyKey: input.idempotencyKey,
                        createdById: input.createdById,
                    },
                });

                const createdHold = result.bookingHold!;
                const finalResult: CreateHoldResult = {
                    ...createdHold,
                    guestToken: this.generateGuestToken(createdHold.id, createdHold.organizationId, createdHold.guestEmail),
                };

                return finalResult;
            },
        );

        return res.data;
    }

    /**
     * Generates a tamper-proof HMAC guest token bound to the hold and guest identity
     */
    generateGuestToken(holdId: string, organizationId: string, guestEmail?: string | null): string {
        const secret = process.env.JWT_SECRET || process.env.APP_SECRET;
        if (!secret || secret.length < 32) throw new UnauthorizedException('Reservation security is not configured. Please try again later.');
        const payload = `${holdId}:${organizationId}:${(guestEmail || '').toLowerCase().trim()}`;
        const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        return `gst_${Buffer.from(`${holdId}:${signature}`).toString('base64url')}`;
    }

    /**
     * Verifies that a guest token matches the hold and organization
     */
    verifyGuestToken(guestToken: string, holdId: string, organizationId: string, guestEmail?: string | null): boolean {
        if (!guestToken) return false;
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
     * Persists customer guest details, preferences, marketing consent, and organization intake form responses to an active hold.
     * Enforces required form rules, rotates the guest token, and returns a canonical review snapshot.
     */
    async persistHoldDetails(
        holdId: string,
        organizationId: string,
        input: PublicPersistHoldDetailsDto,
    ): Promise<{ holdId: string; status: string; expiresAt: string; guestToken: string; review: CanonicalHoldReviewDto }> {
        const hold = await this.prisma.bookingHold.findFirst({
            where: { id: holdId, organizationId },
            include: {
                organization: true,
                location: true,
                service: true,
                staff: true,
            },
        });

        if (!hold) {
            throw new NotFoundException(`Booking hold ${holdId} not found.`);
        }

        const now = new Date();
        if (hold.status !== 'ACTIVE' || hold.expiresAt <= now) {
            throw new BadRequestException({
                code: 'HOLD_EXPIRED',
                message: 'Your reserved time expired before details were completed. Please choose another time.',
            });
        }

        // Validate current guest token against the hold's current state (or unassigned initial hold)
        const isInitialTokenValid = this.verifyGuestToken(input.guestToken, holdId, organizationId, hold.guestEmail);
        if (!isInitialTokenValid) {
            throw new UnauthorizedException('Invalid guest authorization token for this reservation hold.');
        }

        // Load applicable active intake forms for this service
        const applicableForms = await this.prisma.intakeForm.findMany({
            where: {
                organizationId,
                archivedAt: null,
                isActive: true,
                OR: [
                    { isGlobal: true },
                    { serviceIntakeForms: { some: { serviceId: hold.serviceId } } },
                ],
            },
            include: {
                serviceIntakeForms: { where: { serviceId: hold.serviceId } },
            },
            orderBy: { createdAt: 'asc' },
        });

        const intakeSnapshotList = [];
        for (const form of applicableForms) {
            const isFormRequired = form.isGlobal || form.serviceIntakeForms.some((s) => s.isRequired);
            const clientResponse = input.intakeResponses?.find((r) => r.intakeFormId === form.id);
            const responses = clientResponse?.responses || {};

            const formFields = Array.isArray(form.fields) ? (form.fields as any[]) : [];
            for (const field of formFields) {
                const value = responses[field.id];
                const isRequiredField = isFormRequired && field.required;
                if (isRequiredField && (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0))) {
                    throw new BadRequestException({
                        code: 'INTAKE_VALIDATION_FAILED',
                        message: `Please provide a response for: ${field.label}`,
                        fieldId: field.id,
                        formId: form.id,
                    });
                }
            }

            intakeSnapshotList.push({
                intakeFormId: form.id,
                formName: form.name,
                responses,
                fieldsSummary: formFields.map((f) => ({
                    id: f.id,
                    label: f.label,
                    value: responses[f.id] ?? null,
                })),
            });
        }

        const normalizedEmail = input.email.toLowerCase().trim();
        const normalizedName = input.fullName.trim();
        const normalizedPhone = input.phone?.trim() || null;
        const normalizedNotes = input.notes?.trim() || null;
        const consentMarketing = Boolean(input.consentMarketing);
        const detailsCompletedAt = new Date();

        const updatedHold = await this.prisma.bookingHold.update({
            where: { id: holdId },
            data: {
                guestName: normalizedName,
                guestEmail: normalizedEmail,
                guestPhone: normalizedPhone,
                guestNotes: normalizedNotes,
                consentMarketing,
                consentCapturedAt: consentMarketing ? detailsCompletedAt : null,
                detailsCompletedAt,
                intakeSnapshot: intakeSnapshotList as any,
            },
            include: {
                organization: true,
                location: true,
                service: true,
                staff: true,
            },
        });

        // Rotate token bound to the newly persisted normalized email
        const rotatedGuestToken = this.generateGuestToken(holdId, organizationId, normalizedEmail);

        const review = this.buildCanonicalReviewSnapshot(updatedHold, rotatedGuestToken);

        return {
            holdId: updatedHold.id,
            status: updatedHold.status,
            expiresAt: updatedHold.expiresAt.toISOString(),
            guestToken: rotatedGuestToken,
            review,
        };
    }

    /**
     * Builds a canonical server snapshot of the hold, quote, and intake review
     */
    private buildCanonicalReviewSnapshot(hold: any, guestToken: string): CanonicalHoldReviewDto {
        const quote = hold.quoteSnapshot || {};
        const org = hold.organization || {};
        const loc = hold.location || {};
        const srv = hold.service || {};
        const staff = hold.staff;

        const basePriceCents = Number(quote.basePriceCents ?? quote.priceCents ?? srv.priceCents ?? 0);
        const payableNowCents = Number(quote.payableNowCents ?? quote.depositAmountCents ?? quote.depositCents ?? 0);
        const remainingBalanceCents = Number(quote.remainingBalanceCents ?? Math.max(0, basePriceCents - payableNowCents));

        return {
            holdId: hold.id,
            status: hold.status,
            expiresAt: hold.expiresAt.toISOString(),
            serverNow: new Date().toISOString(),
            guestToken,
            detailsCompletedAt: hold.detailsCompletedAt?.toISOString() || null,
            organization: {
                id: org.id,
                name: org.name,
                slug: org.slug,
                brandName: org.brandName || org.name,
                logoUrl: org.logoUrl || null,
                phone: org.phone || null,
                email: org.email || null,
                currency: org.currency || "USD",
                timezone: org.timezone || loc.timezone || "UTC",
                stripeConnected: Boolean(org.stripeAccountId && org.stripeChargesEnabled),
            },
            location: {
                id: loc.id,
                name: loc.name,
                address: loc.address || null,
                city: loc.city || null,
                state: loc.state || null,
                timezone: loc.timezone || "UTC",
            },
            service: {
                id: srv.id,
                name: srv.name,
                description: srv.description || null,
                durationMin: srv.durationMin || 60,
                priceCents: srv.priceCents || basePriceCents,
                currency: srv.currency || org.currency || "USD",
            },
            staff: staff ? {
                id: staff.id,
                displayName: staff.displayName,
                avatarUrl: staff.avatarUrl || null,
            } : null,
            schedule: {
                startAt: hold.startAt.toISOString(),
                endAt: hold.endAt.toISOString(),
                partySize: hold.partySize || 1,
                timezone: loc.timezone || org.timezone || "UTC",
            },
            guest: hold.detailsCompletedAt ? {
                fullName: hold.guestName,
                email: hold.guestEmail,
                phone: hold.guestPhone,
                notes: hold.guestNotes,
                consentMarketing: hold.consentMarketing,
            } : null,
            intake: Array.isArray(hold.intakeSnapshot) ? hold.intakeSnapshot : [],
            quote: {
                basePriceCents,
                taxCents: Number(quote.taxCents || 0),
                discountCents: Number(quote.discountCents || 0),
                totalCents: Number(quote.totalCents || basePriceCents),
                depositCents: Number(quote.depositCents || payableNowCents),
                payableNowCents,
                remainingBalanceCents,
                currency: quote.currency || srv.currency || org.currency || "USD",
            },
            policy: {
                cancelCutoffHours: quote.cancellationPolicy?.cancelCutoffHours ?? 24,
                cancelFeeType: quote.cancellationPolicy?.cancelFeeType,
                cancelFeeValue: quote.cancellationPolicy?.cancelFeeValue,
                description: quote.cancellationPolicy?.description || "Cancellations must be made prior to the notice cutoff window.",
            },
        };
    }

    /**
     * Retrieves canonical hold review snapshot by ID with guest token or authenticated customer ownership validation
     */
    async getCanonicalHoldReview(
        holdId: string,
        organizationId: string,
        guestToken?: string,
        authenticatedCustomerId?: string,
    ): Promise<CanonicalHoldReviewDto> {
        const hold = await this.prisma.bookingHold.findFirst({
            where: { id: holdId, organizationId },
            include: {
                organization: true,
                location: true,
                service: true,
                staff: true,
            },
        });

        if (!hold) {
            throw new NotFoundException(`Booking hold ${holdId} not found.`);
        }

        if (hold.status === 'ACTIVE' && hold.expiresAt <= new Date()) {
            await this.prisma.bookingHold.updateMany({ where: { id: hold.id, status: 'ACTIVE', expiresAt: { lte: new Date() } }, data: { status: 'EXPIRED' } });
            throw new BadRequestException({ code: 'HOLD_EXPIRED', message: 'Your reserved time has expired. Please select an available slot.' });
        }

        // Ownership verification
        let isAuthorized = false;
        if (guestToken && this.verifyGuestToken(guestToken, holdId, organizationId, hold.guestEmail)) {
            isAuthorized = true;
        } else if (authenticatedCustomerId && hold.customerId === authenticatedCustomerId) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            throw new UnauthorizedException('You do not have authorization to view this booking reservation.');
        }

        return this.buildCanonicalReviewSnapshot(hold, guestToken || this.generateGuestToken(holdId, organizationId, hold.guestEmail));
    }

    /**
     * Retrieves a hold by ID, evaluating expiration automatically
     */
    async getHold(holdId: string, organizationId: string): Promise<BookingHold> {
        const hold = await this.prisma.bookingHold.findFirst({
            where: { id: holdId, organizationId },
        });

        if (!hold) {
            throw new NotFoundException(`Booking hold ${holdId} not found.`);
        }

        // Check expiration
        if (hold.status === 'ACTIVE' && hold.expiresAt <= new Date()) {
            const updated = await this.prisma.bookingHold.update({
                where: { id: holdId },
                data: { status: 'EXPIRED' },
            });
            return updated;
        }

        return hold;
    }

    /**
     * Explicitly cancels an active hold and releases any pending Stripe PaymentIntent
     */
    async cancelHold(holdId: string, organizationId: string, guestToken?: string): Promise<BookingHold> {
        const hold = await this.prisma.bookingHold.findFirst({
            where: { id: holdId, organizationId },
            include: { organization: true },
        });

        if (!hold) {
            throw new NotFoundException(`Booking hold ${holdId} not found.`);
        }

        if (guestToken && !this.verifyGuestToken(guestToken, holdId, organizationId, hold.guestEmail)) {
            throw new UnauthorizedException('Invalid guest authorization token for this reservation hold.');
        }

        if (hold.status === 'CANCELLED' || hold.status === 'CONVERTED') {
            return hold;
        }

        const updated = await this.prisma.bookingHold.update({
            where: { id: holdId },
            data: { status: 'CANCELLED' },
        });

        // Cancel any pending payment records and remote Stripe payment intents
        const pendingPayment = await this.prisma.paymentRecord.findFirst({
            where: {
                bookingHoldId: holdId,
                status: PaymentRecordStatus.PENDING,
            },
        });

        if (pendingPayment) {
            await this.prisma.paymentRecord.update({
                where: { id: pendingPayment.id },
                data: { status: PaymentRecordStatus.CANCELLED, failureReason: "Hold cancelled by customer" },
            });

            if (this.paymentProvider?.cancelPaymentIntent) {
                try {
                    await this.paymentProvider.cancelPaymentIntent(
                        pendingPayment.providerPaymentId,
                        hold.organization?.stripeAccountId || undefined,
                    );
                } catch (err: any) {
                    this.logger.warn(`Remote Stripe cancellation on hold release warning: ${err.message}`);
                }
            }
        }

        await this.outboxService.emit({
            aggregateType: 'BookingHold',
            aggregateId: holdId,
            eventType: 'booking_hold.cancelled',
            payload: { holdId, organizationId },
        });

        return updated;
    }
}
