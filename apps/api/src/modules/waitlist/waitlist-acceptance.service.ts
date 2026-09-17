import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ScheduleGuardService } from "../concurrency/schedule-guard.service";
import { PricingService } from "../pricing/pricing.service";
import { PaymentsService } from "../payments/payments.service";
import { AuthoritativeAvailabilityValidatorService } from "../availability/authoritative-availability-validator.service";
import {
    AcceptOfferInput,
    OfferAcceptanceResultDto,
    WaitlistOfferStatus,
} from "@bookpro/contracts";

import { IdempotencyService } from "../common/idempotency.service";

@Injectable()
export class WaitlistAcceptanceService {
    private readonly logger = new Logger(WaitlistAcceptanceService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly scheduleGuardService: ScheduleGuardService,
        private readonly pricingService: PricingService,
        private readonly paymentsService: PaymentsService,
        private readonly authoritativeValidator: AuthoritativeAvailabilityValidatorService,
        private readonly idempotencyService: IdempotencyService,
    ) { }

    /**
     * Executes Atomic First-Wins Waitlist Offer Acceptance
     * (PRD §37.3, Architecture §90, §260–262, §420, §447)
     */
    async acceptOffer(input: AcceptOfferInput): Promise<OfferAcceptanceResultDto> {
        if (!input.token || input.token.trim().length < 16) {
            throw new BadRequestException("Invalid or missing offer acceptance token.");
        }

        const token = input.token.trim();

        // Step 1: Preliminary lookup
        const initialOffer = await this.prisma.waitlistOffer.findUnique({
            where: { token },
            include: {
                waitlistEntry: {
                    include: { customer: true },
                },
                service: true,
                location: true,
                staff: true,
            },
        });

        if (!initialOffer) {
            throw new NotFoundException("Offer not found or invalid token.");
        }

        const res = await this.idempotencyService.executeIdempotent<OfferAcceptanceResultDto>(
            {
                organizationId: initialOffer.organizationId,
                operation: "WAITLIST_OFFER_ACCEPT",
                idempotencyKey: input.idempotencyKey || `offer-accept-${initialOffer.id}`,
                payload: input,
            },
            async () => {

        // Idempotency: If already accepted, return existing state
        if (initialOffer.status === "ACCEPTED") {
            return this.buildAlreadyAcceptedResponse(initialOffer);
        }

        if (initialOffer.status === "LOST_TO_ANOTHER_CUSTOMER") {
            throw new ConflictException(
                "WAITLIST_OFFER_UNAVAILABLE: This opening has already been claimed by another customer.",
            );
        }

        if (initialOffer.status === "EXPIRED" || initialOffer.expiresAt < new Date()) {
            // Ensure status is marked EXPIRED if not already
            if (initialOffer.status !== "EXPIRED") {
                await this.prisma.waitlistOffer.update({
                    where: { id: initialOffer.id },
                    data: { status: "EXPIRED" },
                });
            }
            throw new BadRequestException("WAITLIST_OFFER_EXPIRED: This offer has expired.");
        }

        if (initialOffer.status !== "PENDING") {
            throw new BadRequestException(`Offer is no longer available (Status: ${initialOffer.status}).`);
        }

        // Verify customer ownership if customer ID is explicitly supplied
        if (input.customerId && initialOffer.waitlistEntry.customerId !== input.customerId) {
            throw new ForbiddenException("Cannot accept an offer belonging to another customer.");
        }

        // Step 2: Calculate commercial quote snapshot for payment evaluation
        const quote = await this.pricingService.calculateQuote(initialOffer.organizationId, {
            serviceId: initialOffer.serviceId,
            staffId: initialOffer.staffId || undefined,
            locationId: initialOffer.locationId,
        });

        const depositRequiredCents = quote.depositCents ?? 0;
        const totalAmountCents = quote.totalCents ?? initialOffer.service.priceCents;
        const requiresPayment = depositRequiredCents > 0 || totalAmountCents > 0;
        const paymentAmountCents = depositRequiredCents > 0 ? depositRequiredCents : totalAmountCents;

        // Step 3: Atomic Transaction with Authoritative Availability Validator
        const transactionResult = await this.prisma.$transaction(
            async (tx) => {
                // Lock the offer row
                const lockedOffers: any[] = await tx.$queryRaw`
                    SELECT * FROM "waitlist_offers"
                    WHERE "id" = ${initialOffer.id}::uuid
                    FOR UPDATE
                `;

                if (lockedOffers.length === 0) {
                    throw new NotFoundException("Offer not found.");
                }

                const currentOffer = lockedOffers[0];
                if (currentOffer.status !== "PENDING") {
                    if (currentOffer.status === "ACCEPTED") {
                        return { alreadyAccepted: true };
                    }
                    if (currentOffer.status === "LOST_TO_ANOTHER_CUSTOMER") {
                        throw new ConflictException(
                            "WAITLIST_OFFER_UNAVAILABLE: This opening has already been claimed by another customer.",
                        );
                    }
                    throw new BadRequestException(`Offer is no longer available (Status: ${currentOffer.status}).`);
                }

                if (currentOffer.expires_at < new Date()) {
                    await tx.waitlistOffer.update({
                        where: { id: initialOffer.id },
                        data: { status: "EXPIRED" },
                    });
                    throw new BadRequestException("WAITLIST_OFFER_EXPIRED: This offer has expired.");
                }

                let createdHoldId: string | null = null;
                let createdAppointmentId: string | null = null;

                if (requiresPayment) {
                    // Create standard BookingHold via authoritative validator
                    const res = await this.authoritativeValidator.validateAndReserveSlot({
                        organizationId: initialOffer.organizationId,
                        locationId: initialOffer.locationId,
                        serviceId: initialOffer.serviceId,
                        staffId: initialOffer.staffId,
                        customerId: initialOffer.waitlistEntry.customerId,
                        startAt: initialOffer.startAt,
                        partySize: initialOffer.waitlistEntry.partySize || 1,
                        targetType: "HOLD",
                        holdDetails: {
                            idempotencyKey: input.idempotencyKey || `waitlist-hold-${initialOffer.id}`,
                        },
                    }, tx);

                    const hold = res.bookingHold!;
                    createdHoldId = hold.id;

                    // Update offer status to ACCEPTED with reference to hold
                    await tx.waitlistOffer.update({
                        where: { id: initialOffer.id },
                        data: {
                            status: "ACCEPTED",
                            bookingHoldId: hold.id,
                            acceptedAt: new Date(),
                        },
                    });
                } else {
                    // Free / Zero-price Service: directly create authoritative Appointment
                    const res = await this.authoritativeValidator.validateAndReserveSlot({
                        organizationId: initialOffer.organizationId,
                        locationId: initialOffer.locationId,
                        serviceId: initialOffer.serviceId,
                        staffId: initialOffer.staffId,
                        customerId: initialOffer.waitlistEntry.customerId,
                        startAt: initialOffer.startAt,
                        partySize: initialOffer.waitlistEntry.partySize || 1,
                        targetType: "APPOINTMENT",
                        appointmentDetails: {
                            bookingSource: "WAITLIST",
                            paymentStatus: "NOT_REQUIRED",
                        },
                    }, tx);

                    const appt = res.appointment!;
                    createdAppointmentId = appt.id;

                    // Update offer status to ACCEPTED with reference to appointment
                    await tx.waitlistOffer.update({
                        where: { id: initialOffer.id },
                        data: {
                            status: "ACCEPTED",
                            appointmentId: appt.id,
                            acceptedAt: new Date(),
                        },
                    });

                    // Mark WaitlistEntry as BOOKED
                    await tx.waitlistEntry.update({
                        where: { id: initialOffer.waitlistEntryId },
                        data: { status: "BOOKED" },
                    });
                }

                // Revoke / Transition Competing Offers for the same slot (PRD §37.3)
                const competingOffers = await tx.waitlistOffer.findMany({
                    where: {
                        organizationId: initialOffer.organizationId,
                        id: { not: initialOffer.id },
                        status: "PENDING",
                        startAt: { lt: initialOffer.endAt },
                        endAt: { gt: initialOffer.startAt },
                        ...(initialOffer.staffId ? { staffId: initialOffer.staffId } : {}),
                    },
                });

                for (const comp of competingOffers) {
                    await tx.waitlistOffer.update({
                        where: { id: comp.id },
                        data: {
                            status: "LOST_TO_ANOTHER_CUSTOMER",
                            revokedAt: new Date(),
                        },
                    });

                    await tx.outboxEvent.create({
                        data: {
                            organizationId: initialOffer.organizationId,
                            aggregateType: "WaitlistOffer",
                            aggregateId: comp.id,
                            eventType: "waitlist.offer_lost",
                            payload: {
                                offerId: comp.id,
                                waitlistEntryId: comp.waitlistEntryId,
                                organizationId: initialOffer.organizationId,
                            },
                            status: "PENDING",
                        },
                    });
                }

                // Emit offer accepted outbox event
                await tx.outboxEvent.create({
                    data: {
                        organizationId: initialOffer.organizationId,
                        aggregateType: "WaitlistOffer",
                        aggregateId: initialOffer.id,
                        eventType: "waitlist.offer_accepted",
                        payload: {
                            offerId: initialOffer.id,
                            waitlistEntryId: initialOffer.waitlistEntryId,
                            organizationId: initialOffer.organizationId,
                            appointmentId: createdAppointmentId,
                            bookingHoldId: createdHoldId,
                            requiresPayment,
                        },
                        status: "PENDING",
                    },
                });

                return {
                    alreadyAccepted: false,
                    holdId: createdHoldId,
                    appointmentId: createdAppointmentId,
                };
            },
            {
                timeout: 10000,
                isolationLevel: "ReadCommitted",
            },
        );

        if (transactionResult.alreadyAccepted) {
            return this.buildAlreadyAcceptedResponse(initialOffer);
        }

        // Step 4: Out-of-transaction Payment Creation (Invariant 17: No external network calls in locks)
        let clientSecret: string | undefined = undefined;
        let paymentIntentId: string | undefined = undefined;

        if (requiresPayment && transactionResult.holdId) {
            try {
                const paymentIntent = await this.paymentsService.createPaymentIntent(
                    initialOffer.organizationId,
                    {
                        holdId: transactionResult.holdId,
                        amountCents: paymentAmountCents,
                        currency: quote.currency || "USD",
                        idempotencyKey: input.idempotencyKey || `offer-accept-${initialOffer.id}`,
                    },
                );
                clientSecret = paymentIntent.clientSecret;
                paymentIntentId = paymentIntent.paymentIntentId;
            } catch (err: any) {
                this.logger.warn(`[Waitlist] PaymentIntent creation error: ${err.message}`);
            }
        }

        this.logger.log(
            `[Waitlist] Offer ${initialOffer.id} successfully accepted by customer ${initialOffer.waitlistEntry.customerId} (Requires Payment: ${requiresPayment})`,
        );

        return {
            success: true,
            status: "ACCEPTED",
            offerId: initialOffer.id,
            appointmentId: transactionResult.appointmentId || undefined,
            bookingHoldId: transactionResult.holdId || undefined,
            clientSecret,
            paymentIntentId,
            requiresPayment,
            message: requiresPayment
                ? "Offer accepted! Please complete payment within 10 minutes to finalize your booking."
                : "Offer accepted! Your appointment is confirmed.",
        };
    });

    return res.data;
}

    private async buildAlreadyAcceptedResponse(offer: any): Promise<OfferAcceptanceResultDto> {
        const fullOffer = await this.prisma.waitlistOffer.findUnique({
            where: { id: offer.id },
            include: { bookingHold: true, appointment: true },
        });

        const requiresPayment = !!fullOffer?.bookingHoldId && !fullOffer?.appointmentId;

        return {
            success: true,
            status: "ACCEPTED",
            offerId: offer.id,
            appointmentId: fullOffer?.appointmentId || undefined,
            bookingHoldId: fullOffer?.bookingHoldId || undefined,
            requiresPayment,
            message: requiresPayment
                ? "Offer has already been claimed. Please complete payment if not yet finalized."
                : "Offer has already been claimed and confirmed.",
        };
    }
}
