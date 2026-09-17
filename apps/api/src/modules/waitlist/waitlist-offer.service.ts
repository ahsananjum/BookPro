import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Optional,
} from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../database/prisma.service";
import { OutboxService } from "../outbox/outbox.service";
import { PolicyService } from "../policy/policy.service";
import { PricingService } from "../pricing/pricing.service";
import { BusyIntervalRepository } from "../availability/busy-interval-repository";
import { AuthoritativeAvailabilityValidatorService } from "../availability/authoritative-availability-validator.service";
import { RealtimeService } from "../realtime/realtime.service";
import { Instant } from "@bookpro/server-core";
import {
    CreateManualOfferInput,
    WaitlistOfferDto,
    OfferPublicPreviewDto,
    WaitlistOfferStatus,
    CustomerActiveOfferDto,
    WaitlistHoldBlockDto,
} from "@bookpro/contracts";

@Injectable()
export class WaitlistOfferService {
    private readonly logger = new Logger(WaitlistOfferService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly outboxService: OutboxService,
        private readonly policyService: PolicyService,
        private readonly pricingService: PricingService,
        private readonly busyIntervalRepo: BusyIntervalRepository,
        private readonly authoritativeValidator: AuthoritativeAvailabilityValidatorService,
        @Optional() private readonly realtimeService?: RealtimeService,
    ) { }

    /**
     * Generates a 64-hex character (256-bit entropy) cryptographic token
     */
    static generateOfferToken(): string {
        return crypto.randomBytes(32).toString("hex");
    }

    /**
     * Staff creates a manual waitlist offer from a backend-validated schedule opening
     * (PRD §37 / Architecture §88, §262 — Manager cannot bypass availability invariants)
     */
    async createManualOffer(
        organizationId: string,
        input: CreateManualOfferInput,
        staffUserId?: string,
    ): Promise<WaitlistOfferDto> {
        // Step 1: Load WaitlistEntry
        const entry = await this.prisma.waitlistEntry.findFirst({
            where: { id: input.waitlistEntryId, organizationId },
            include: { service: true, customer: true },
        });

        if (!entry) {
            throw new NotFoundException(`Waitlist entry ${input.waitlistEntryId} not found.`);
        }

        if (entry.status !== "ACTIVE" && entry.status !== "OFFERED") {
            throw new BadRequestException(`Cannot create offer for waitlist entry with status ${entry.status}.`);
        }

        // Step 2: Validate and derive startAt and endAt timestamps
        const startAt = new Date(input.startAt);
        if (isNaN(startAt.getTime())) {
            throw new BadRequestException("Invalid startAt timestamp.");
        }

        if (startAt < new Date()) {
            throw new BadRequestException("Cannot create an offer for a past time slot.");
        }

        // Step 3: Resolve Location
        let locationId = input.locationId || entry.locationId;
        if (!locationId) {
            const firstLoc = await this.prisma.location.findFirst({
                where: { organizationId },
            });
            if (!firstLoc) {
                throw new NotFoundException("No location found in organization.");
            }
            locationId = firstLoc.id;
        }

        // Step 4: Resolve Staff
        let staffId = input.staffId !== undefined ? input.staffId : entry.staffId;

        // Step 5: Authoritative Read Validation (hours, breaks, holidays, holds, etc.)
        const validation = await this.authoritativeValidator.validateSlotForRead(
            organizationId,
            locationId,
            entry.serviceId,
            staffId,
            startAt,
            entry.partySize || 1,
        );

        if (!validation.isAvailable) {
            throw new ConflictException(validation.reason || "The requested time slot is not available.");
        }

        const endAt = validation.endAt.toDate();

        // Step 6: Resolve Offer Expiration Duration
        const policy = await this.policyService.resolvePolicy(
            organizationId,
            locationId,
            entry.serviceId,
        );
        const expiryMinutes = input.expiresInMinutes ?? policy?.waitlistOfferExpiryMinutes ?? 15;
        const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

        // Step 7: Generate High-Entropy Token and Create Offer
        const token = WaitlistOfferService.generateOfferToken();

        const offer = await this.prisma.$transaction(async (tx) => {
            // Authoritatively lock the slot by creating an active BookingHold
            const createdHold = await tx.bookingHold.create({
                data: {
                    organizationId,
                    locationId,
                    serviceId: entry.serviceId,
                    staffId: staffId || null,
                    customerId: entry.customerId,
                    startAt,
                    endAt,
                    partySize: entry.partySize || 1,
                    status: "ACTIVE",
                    expiresAt,
                    quoteSnapshot: {
                        totalCents: entry.service.priceCents || 0,
                        depositCents: 0,
                        currency: entry.service.currency || "USD",
                    },
                },
            });

            const createdOffer = await tx.waitlistOffer.create({
                data: {
                    organizationId,
                    waitlistEntryId: entry.id,
                    serviceId: entry.serviceId,
                    locationId,
                    staffId,
                    startAt,
                    endAt,
                    token,
                    status: "PENDING",
                    bookingHoldId: createdHold.id,
                    expiresAt,
                },
                include: {
                    service: true,
                    location: true,
                    staff: true,
                    waitlistEntry: {
                        include: { customer: true },
                    },
                },
            });

            // Update entry status to OFFERED
            await tx.waitlistEntry.update({
                where: { id: entry.id },
                data: { status: "OFFERED" },
            });

            return createdOffer;
        });

        // Step 8: Emit Outbox event for Offer Notification
        const claimUrl = `/offers/${token}`;
        await this.outboxService.emit({
            organizationId,
            aggregateType: "WaitlistOffer",
            aggregateId: offer.id,
            eventType: "waitlist.offer_created",
            payload: {
                offerId: offer.id,
                organizationId,
                waitlistEntryId: entry.id,
                customerId: entry.customerId,
                customerName: entry.customer.fullName,
                customerEmail: entry.customer.email,
                serviceName: entry.service.name,
                staffName: offer.staff?.displayName || "Any Available Stylist",
                locationName: offer.location.name,
                startAt: offer.startAt.toISOString(),
                endAt: offer.endAt.toISOString(),
                expiresAt: offer.expiresAt.toISOString(),
                claimToken: token,
                claimUrl,
            },
        });

        // Broadcast realtime SSE event for instant calendar and portal sync
        if (this.realtimeService) {
            await this.realtimeService.broadcastEvent({
                organizationId,
                type: "waitlist.offer_created",
                timestamp: new Date().toISOString(),
                metadata: {
                    offerId: offer.id,
                    waitlistEntryId: entry.id,
                    startAt: offer.startAt.toISOString(),
                    endAt: offer.endAt.toISOString(),
                    customerName: entry.customer.fullName,
                    serviceName: entry.service.name,
                },
            }).catch(() => null);
        }

        this.logger.log(
            `[Waitlist] Created offer ${offer.id} with hold ${offer.bookingHoldId} for entry ${entry.id} (Token: ${token.slice(0, 8)}..., Expires: ${expiresAt.toISOString()})`,
        );

        return this.mapToDto(offer);
    }

    /**
     * Staff revokes a pending offer
     */
    async revokeOffer(
        organizationId: string,
        offerId: string,
    ): Promise<WaitlistOfferDto> {
        const offer = await this.prisma.waitlistOffer.findFirst({
            where: { id: offerId, organizationId },
        });

        if (!offer) {
            throw new NotFoundException(`Waitlist offer ${offerId} not found.`);
        }

        if (offer.status !== "PENDING") {
            throw new BadRequestException(`Cannot revoke offer in status ${offer.status}.`);
        }

        const revoked = await this.prisma.$transaction(async (tx) => {
            const updatedOffer = await tx.waitlistOffer.update({
                where: { id: offerId },
                data: {
                    status: "REVOKED",
                    revokedAt: new Date(),
                },
                include: {
                    service: true,
                    location: true,
                    staff: true,
                },
            });

            if (offer.bookingHoldId) {
                await tx.bookingHold.updateMany({
                    where: { id: offer.bookingHoldId, status: "ACTIVE" },
                    data: { status: "RELEASED" },
                });
            }

            // Restore waitlist entry to ACTIVE
            await tx.waitlistEntry.update({
                where: { id: offer.waitlistEntryId },
                data: { status: "ACTIVE" },
            });

            return updatedOffer;
        });

        await this.outboxService.emit({
            organizationId,
            aggregateType: "WaitlistOffer",
            aggregateId: revoked.id,
            eventType: "waitlist.offer_revoked",
            payload: {
                offerId: revoked.id,
                organizationId,
                waitlistEntryId: revoked.waitlistEntryId,
            },
        });

        if (this.realtimeService) {
            await this.realtimeService.broadcastEvent({
                organizationId,
                type: "waitlist.offer_revoked",
                timestamp: new Date().toISOString(),
                metadata: { offerId: revoked.id },
            }).catch(() => null);
        }

        return this.mapToDto(revoked);
    }

    /**
     * Authenticated Customer fetches their active pending waitlist offers
     */
    async getCustomerActiveOffers(
        organizationId: string,
        customerId: string,
    ): Promise<CustomerActiveOfferDto[]> {
        const now = new Date();
        const offers = await this.prisma.waitlistOffer.findMany({
            where: {
                organizationId,
                waitlistEntry: { customerId },
                status: "PENDING",
                expiresAt: { gt: now },
            },
            include: {
                service: true,
                location: true,
                staff: true,
                organization: true,
                waitlistEntry: true,
            },
            orderBy: { createdAt: "desc" },
        });

        return Promise.all(
            offers.map(async (o) => {
                let depositRequiredCents = 0;
                let priceCents = o.service.priceCents;
                try {
                    const quote = await this.pricingService.calculateQuote(o.organizationId, {
                        serviceId: o.serviceId,
                        staffId: o.staffId || undefined,
                        locationId: o.locationId,
                    });
                    depositRequiredCents = quote.depositCents ?? 0;
                    priceCents = quote.totalCents ?? o.service.priceCents;
                } catch {
                    // Fallback to service defaults
                }

                return {
                    offerId: o.id,
                    token: o.token,
                    organizationId: o.organizationId,
                    organizationName: o.organization.name,
                    waitlistEntryId: o.waitlistEntryId,
                    serviceId: o.serviceId,
                    serviceName: o.service.name,
                    serviceDurationMin: o.service.durationMin,
                    priceCents,
                    depositRequiredCents,
                    staffId: o.staffId,
                    staffName: o.staff?.displayName || "Any Available Specialist",
                    locationId: o.locationId,
                    locationName: o.location.name,
                    locationAddress: o.location.address || undefined,
                    startAt: o.startAt.toISOString(),
                    endAt: o.endAt.toISOString(),
                    expiresAt: o.expiresAt.toISOString(),
                    status: o.status as WaitlistOfferStatus,
                    score: o.score,
                    requiresPayment: depositRequiredCents > 0 || priceCents > 0,
                };
            })
        );
    }

    /**
     * Customer declines an offer (with optional feedback and cascade trigger)
     */
    async declineOffer(
        token: string,
        reason?: string,
        removeFromWaitlist: boolean = false,
    ): Promise<{ success: boolean; message: string }> {
        const offer = await this.prisma.waitlistOffer.findUnique({
            where: { token },
            include: { waitlistEntry: true },
        });

        if (!offer) {
            throw new NotFoundException("Offer not found or invalid token.");
        }

        if (offer.status !== "PENDING") {
            throw new BadRequestException(`Offer is no longer active (Status: ${offer.status}).`);
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.waitlistOffer.update({
                where: { id: offer.id },
                data: {
                    status: "REVOKED",
                    revokedAt: new Date(),
                },
            });

            if (offer.bookingHoldId) {
                await tx.bookingHold.updateMany({
                    where: { id: offer.bookingHoldId, status: "ACTIVE" },
                    data: { status: "RELEASED" },
                });
            }

            if (removeFromWaitlist) {
                await tx.waitlistEntry.update({
                    where: { id: offer.waitlistEntryId },
                    data: { status: "CANCELLED" },
                });
            } else {
                // Restore waitlist entry to ACTIVE
                await tx.waitlistEntry.update({
                    where: { id: offer.waitlistEntryId },
                    data: { status: "ACTIVE" },
                });
            }

            await tx.outboxEvent.create({
                data: {
                    organizationId: offer.organizationId,
                    aggregateType: "WaitlistOffer",
                    aggregateId: offer.id,
                    eventType: "waitlist.offer_declined",
                    payload: {
                        offerId: offer.id,
                        waitlistEntryId: offer.waitlistEntryId,
                        reason: reason || "Customer declined offer",
                        removeFromWaitlist,
                    },
                    status: "PENDING",
                },
            });
        });

        if (this.realtimeService) {
            await this.realtimeService.broadcastEvent({
                organizationId: offer.organizationId,
                type: "waitlist.offer_revoked",
                timestamp: new Date().toISOString(),
                metadata: { offerId: offer.id, reason },
            }).catch(() => null);
        }

        return {
            success: true,
            message: removeFromWaitlist
                ? "Offer declined and waitlist request cancelled."
                : "Offer declined. You remain on the priority waitlist for future openings.",
        };
    }

    /**
     * Fetches active waitlist holds formatted for visual calendar display
     */
    async getWaitlistHoldBlocks(
        organizationId: string,
        startDate?: string,
        endDate?: string,
    ): Promise<WaitlistHoldBlockDto[]> {
        const now = new Date();
        const offers = await this.prisma.waitlistOffer.findMany({
            where: {
                organizationId,
                status: "PENDING",
                expiresAt: { gt: now },
                ...(startDate || endDate
                    ? {
                        startAt: {
                            ...(startDate ? { gte: new Date(startDate) } : {}),
                            ...(endDate ? { lte: new Date(endDate) } : {}),
                        },
                    }
                    : {}),
            },
            include: {
                service: true,
                staff: true,
                location: true,
                waitlistEntry: {
                    include: { customer: true },
                },
            },
            orderBy: { startAt: "asc" },
        });

        return offers.map((o) => ({
            id: o.bookingHoldId || o.id,
            offerId: o.id,
            waitlistEntryId: o.waitlistEntryId,
            customerName: o.waitlistEntry.customer?.fullName || "Waitlist Guest",
            serviceName: o.service.name,
            staffId: o.staffId,
            staffName: o.staff?.displayName || "Any Available Specialist",
            locationId: o.locationId,
            startAt: o.startAt.toISOString(),
            endAt: o.endAt.toISOString(),
            expiresAt: o.expiresAt.toISOString(),
            score: o.score,
            status: "HELD" as const,
        }));
    }

    /**
     * Public Preview of an Offer by Opaque High-Entropy Token
     */
    async getOfferPreviewByToken(token: string): Promise<OfferPublicPreviewDto> {
        if (!token || token.length < 16) {
            throw new BadRequestException("Invalid offer token.");
        }

        const offer = await this.prisma.waitlistOffer.findUnique({
            where: { token },
            include: {
                organization: true,
                service: true,
                location: true,
                staff: true,
            },
        });

        if (!offer) {
            throw new NotFoundException("Offer not found or invalid token.");
        }

        const isExpired = offer.expiresAt < new Date() || offer.status === "EXPIRED";

        // Calculate pricing and deposit requirement
        const quote = await this.pricingService.calculateQuote(offer.organizationId, {
            serviceId: offer.serviceId,
            staffId: offer.staffId || undefined,
            locationId: offer.locationId,
        });

        const depositRequiredCents = quote.depositCents ?? 0;
        const totalAmountCents = quote.totalCents ?? offer.service.priceCents;
        const requiresPayment = depositRequiredCents > 0 || totalAmountCents > 0;

        return {
            offerId: offer.id,
            token: offer.token,
            organizationId: offer.organizationId,
            organizationName: offer.organization.name,
            serviceId: offer.serviceId,
            serviceName: offer.service.name,
            serviceDurationMin: offer.service.durationMin,
            priceCents: totalAmountCents,
            depositRequiredCents,
            staffId: offer.staffId,
            staffName: offer.staff?.displayName || "Any Available Stylist",
            locationId: offer.locationId,
            locationName: offer.location.name,
            locationAddress: offer.location.address || undefined,
            startAt: offer.startAt.toISOString(),
            endAt: offer.endAt.toISOString(),
            expiresAt: offer.expiresAt.toISOString(),
            isExpired,
            status: offer.status as WaitlistOfferStatus,
            requiresPayment,
        };
    }

    /**
     * List offers for a waitlist entry or organization
     */
    async listOffers(
        organizationId: string,
        waitlistEntryId?: string,
    ): Promise<WaitlistOfferDto[]> {
        const offers = await this.prisma.waitlistOffer.findMany({
            where: {
                organizationId,
                ...(waitlistEntryId ? { waitlistEntryId } : {}),
            },
            include: {
                service: true,
                location: true,
                staff: true,
            },
            orderBy: { createdAt: "desc" },
        });

        return offers.map((o) => this.mapToDto(o));
    }

    private mapToDto(offer: any): WaitlistOfferDto {
        return {
            id: offer.id,
            organizationId: offer.organizationId,
            waitlistEntryId: offer.waitlistEntryId,
            serviceId: offer.serviceId,
            serviceName: offer.service?.name,
            locationId: offer.locationId,
            locationName: offer.location?.name,
            staffId: offer.staffId,
            staffName: offer.staff?.displayName,
            startAt: offer.startAt.toISOString(),
            endAt: offer.endAt.toISOString(),
            score: offer.score,
            scoreExplanation: offer.scoreExplanation,
            token: offer.token,
            status: offer.status as WaitlistOfferStatus,
            bookingHoldId: offer.bookingHoldId,
            appointmentId: offer.appointmentId,
            expiresAt: offer.expiresAt.toISOString(),
            acceptedAt: offer.acceptedAt ? offer.acceptedAt.toISOString() : null,
            revokedAt: offer.revokedAt ? offer.revokedAt.toISOString() : null,
            createdAt: offer.createdAt.toISOString(),
            updatedAt: offer.updatedAt ? offer.updatedAt.toISOString() : undefined,
        };
    }
}
