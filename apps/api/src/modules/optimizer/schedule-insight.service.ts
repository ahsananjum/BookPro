import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AvailabilityService } from "../availability/availability.service";
import { WaitlistOfferService } from "../waitlist/waitlist-offer.service";
import { GapDetectionService } from "./gap-detection.service";
import {
    ActionInsightInput,
    DismissInsightInput,
    OptimizerSettingsDto,
    ScheduleInsightDto,
    ScheduleInsightStatus,
    UpdateOptimizerSettingsInput,
    WaitlistOfferDto,
} from "@bookpro/contracts";

import {
    DeterministicScoringService,
    ScheduleGapCandidateInput,
    WaitlistEntryForScoring,
} from "./deterministic-scoring.service";

@Injectable()
export class ScheduleInsightService {
    private readonly logger = new Logger(ScheduleInsightService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly availabilityService: AvailabilityService,
        private readonly waitlistOfferService: WaitlistOfferService,
        private readonly gapDetectionService: GapDetectionService,
        private readonly scoringService: DeterministicScoringService,
    ) {}

    /**
     * Retrieves schedule insights with optional filters.
     */
    async getInsights(
        organizationId: string,
        query: {
            status?: ScheduleInsightStatus;
            locationId?: string;
            staffId?: string;
            limit?: number;
        } = {}
    ): Promise<ScheduleInsightDto[]> {
        const records = await this.prisma.scheduleInsight.findMany({
            where: {
                organizationId,
                ...(query.status ? { status: query.status } : { status: "ACTIVE" }),
                ...(query.locationId ? { locationId: query.locationId } : {}),
                ...(query.staffId ? { staffId: query.staffId } : {}),
            },
            include: {
                location: true,
                staff: { include: { membership: { include: { user: true } } } },
                service: true,
            },
            orderBy: [{ startAt: "asc" }, { potentialRevenueCents: "desc" }],
            take: query.limit || 50,
        });

        return records.map((r) => this.gapDetectionService.toDto(r));
    }

    /**
     * Gets a single insight by ID.
     */
    async getInsightById(organizationId: string, id: string): Promise<ScheduleInsightDto> {
        const record = await this.prisma.scheduleInsight.findFirst({
            where: { id, organizationId },
            include: {
                location: true,
                staff: { include: { membership: { include: { user: true } } } },
                service: true,
            },
        });

        if (!record) {
            throw new NotFoundException(`Schedule insight ${id} not found.`);
        }

        return this.gapDetectionService.toDto(record);
    }

    /**
     * Actions an insight by dispatching a P9 waitlist offer to the top (or selected) candidate.
     * Revalidates live availability before creating the offer.
     */
    async actionInsight(
        organizationId: string,
        insightId: string,
        input: ActionInsightInput = {},
        staffUserId?: string
    ): Promise<{ insight: ScheduleInsightDto; offer: WaitlistOfferDto }> {
        const insight = await this.prisma.scheduleInsight.findFirst({
            where: { id: insightId, organizationId },
            include: { service: true, location: true, staff: true },
        });

        if (!insight) {
            throw new NotFoundException(`Schedule insight ${insightId} not found.`);
        }

        if (insight.status !== "ACTIVE") {
            throw new BadRequestException(`Cannot action schedule insight with status ${insight.status}.`);
        }

        if (insight.startAt < new Date()) {
            await this.prisma.scheduleInsight.update({
                where: { id: insightId },
                data: { status: "STALE", staleAt: new Date() },
            });
            throw new ConflictException("This opening has already passed and is now marked stale.");
        }

        const candidateMatches = (insight.candidateMatches as any[]) || [];
        if (candidateMatches.length === 0) {
            throw new BadRequestException("No candidate waitlist matches available on this insight.");
        }

        // Determine target candidate
        const selectedCandidate = input.selectedEntryId
            ? candidateMatches.find((c) => c.waitlistEntryId === input.selectedEntryId)
            : candidateMatches[0];

        if (!selectedCandidate) {
            throw new NotFoundException(`Candidate match ${input.selectedEntryId} not found in this insight.`);
        }

        // Revalidate real-time availability
        const validation = await this.availabilityService.validateAvailability({
            organizationId,
            locationId: insight.locationId,
            serviceId: insight.serviceId || selectedCandidate.serviceId,
            staffId: insight.staffId || "",
            startTime: insight.startAt.toISOString(),
            partySize: 1,
        });

        if (!validation.isAvailable) {
            await this.prisma.scheduleInsight.update({
                where: { id: insightId },
                data: { status: "STALE", staleAt: new Date() },
            });
            throw new ConflictException("SLOT_UNAVAILABLE: Opening is no longer valid or has already been booked.");
        }

        // Create official P9 waitlist offer
        const offer = await this.waitlistOfferService.createManualOffer(
            organizationId,
            {
                waitlistEntryId: selectedCandidate.waitlistEntryId,
                startAt: insight.startAt.toISOString(),
                endAt: insight.endAt.toISOString(),
                staffId: insight.staffId,
                locationId: insight.locationId,
                expiresInMinutes: input.expiresInMinutes || 120,
            },
            staffUserId
        );

        // Update offer to reference the insight
        await this.prisma.waitlistOffer.update({
            where: { id: offer.id },
            data: { scheduleInsightId: insight.id },
        });

        // Mark insight as ACTIONED
        const updatedInsight = await this.prisma.scheduleInsight.update({
            where: { id: insightId },
            data: {
                status: "ACTIONED",
                actionedAt: new Date(),
                actionedOfferId: offer.id,
            },
            include: {
                location: true,
                staff: { include: { membership: { include: { user: true } } } },
                service: true,
            },
        });

        this.logger.log(`[ScheduleInsight] Actioned insight ${insightId} -> created offer ${offer.id}`);

        return {
            insight: this.gapDetectionService.toDto(updatedInsight),
            offer,
        };
    }

    /**
     * Dismisses an insight without dispatching an offer.
     */
    async dismissInsight(
        organizationId: string,
        insightId: string,
        input: DismissInsightInput = {},
        staffUserId?: string
    ): Promise<ScheduleInsightDto> {
        const insight = await this.prisma.scheduleInsight.findFirst({
            where: { id: insightId, organizationId },
        });

        if (!insight) {
            throw new NotFoundException(`Schedule insight ${insightId} not found.`);
        }

        const updated = await this.prisma.scheduleInsight.update({
            where: { id: insightId },
            data: {
                status: "DISMISSED",
                dismissedAt: new Date(),
                dismissedBy: staffUserId || null,
                metadata: {
                    ...(insight.metadata as any),
                    dismissReason: input.reason || "Dismissed by manager",
                },
            },
            include: {
                location: true,
                staff: { include: { membership: { include: { user: true } } } },
                service: true,
            },
        });

        return this.gapDetectionService.toDto(updated);
    }

    /**
     * Retrieves organization optimizer settings.
     */
    async getSettings(organizationId: string): Promise<OptimizerSettingsDto> {
        const org = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                autoOfferEnabled: true,
                noShowSignalEnabled: true,
                optimizerMinGapMin: true,
            },
        });

        if (!org) {
            throw new NotFoundException(`Organization ${organizationId} not found.`);
        }

        return {
            autoOfferEnabled: org.autoOfferEnabled,
            noShowSignalEnabled: org.noShowSignalEnabled,
            optimizerMinGapMin: org.optimizerMinGapMin || 30,
        };
    }

    /**
     * Updates organization optimizer settings.
     */
    async updateSettings(
        organizationId: string,
        input: UpdateOptimizerSettingsInput
    ): Promise<OptimizerSettingsDto> {
        const updated = await this.prisma.organization.update({
            where: { id: organizationId },
            data: {
                ...(input.autoOfferEnabled !== undefined ? { autoOfferEnabled: input.autoOfferEnabled } : {}),
                ...(input.noShowSignalEnabled !== undefined ? { noShowSignalEnabled: input.noShowSignalEnabled } : {}),
                ...(input.optimizerMinGapMin !== undefined ? { optimizerMinGapMin: input.optimizerMinGapMin } : {}),
            },
            select: {
                autoOfferEnabled: true,
                noShowSignalEnabled: true,
                optimizerMinGapMin: true,
            },
        });

        return {
            autoOfferEnabled: updated.autoOfferEnabled,
            noShowSignalEnabled: updated.noShowSignalEnabled,
            optimizerMinGapMin: updated.optimizerMinGapMin || 30,
        };
    }

    /**
     * Automatically dispatches offers for top matches if autoOfferEnabled is active.
     */
    async processAutoOffers(organizationId: string): Promise<number> {
        const settings = await this.getSettings(organizationId);
        if (!settings.autoOfferEnabled) {
            return 0;
        }

        const activeInsights = await this.prisma.scheduleInsight.findMany({
            where: {
                organizationId,
                status: "ACTIVE",
                startAt: { gt: new Date() },
            },
            take: 10,
        });

        let autoActionedCount = 0;

        for (const insight of activeInsights) {
            const matches = (insight.candidateMatches as any[]) || [];
            const topMatch = matches[0];

            // Only auto-offer high confidence matches (score >= 75)
            if (topMatch && topMatch.totalScore >= 75) {
                try {
                    await this.actionInsight(organizationId, insight.id, {
                        selectedEntryId: topMatch.waitlistEntryId,
                        expiresInMinutes: 60,
                    });
                    autoActionedCount++;
                } catch (error: any) {
                    this.logger.warn(`[AutoOffer] Skipped insight ${insight.id}: ${error.message}`);
                }
            }
        }

        return autoActionedCount;
    }

    /**
     * Autonomous Slot Opening Processor (0-Latency Trigger)
     * Synchronously invoked whenever an appointment is cancelled, rescheduled, or early-completed.
     * Evaluates active waitlist candidates, deterministically scores them, and auto-dispatches
     * an authoritative BookingHold + WaitlistOffer if autoOfferEnabled is active and score >= 70.
     */
    async processSlotOpening(
        organizationId: string,
        locationId: string,
        staffId: string | null | undefined,
        startAt: Date,
        endAt: Date,
        serviceId?: string,
        excludeWaitlistEntryId?: string,
    ): Promise<{
        insightId?: string;
        offerDispatched: boolean;
        offerId?: string;
        candidateEntryId?: string;
        matchCount: number;
    }> {
        const now = new Date();
        if (startAt <= now) {
            return { offerDispatched: false, matchCount: 0 };
        }

        const org = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                autoOfferEnabled: true,
                optimizerMinGapMin: true,
            },
        });

        if (!org) {
            return { offerDispatched: false, matchCount: 0 };
        }

        // Fetch active waitlist entries for organization
        const activeEntries = await this.prisma.waitlistEntry.findMany({
            where: {
                organizationId,
                status: "ACTIVE",
                ...(excludeWaitlistEntryId ? { id: { not: excludeWaitlistEntryId } } : {}),
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            include: { customer: true, service: true },
        });

        if (activeEntries.length === 0) {
            return { offerDispatched: false, matchCount: 0 };
        }

        // Resolve target service
        let targetService = serviceId
            ? await this.prisma.service.findFirst({
                where: { id: serviceId, organizationId, isActive: true, archivedAt: null },
            })
            : null;

        if (!targetService) {
            targetService = await this.prisma.service.findFirst({
                where: {
                    id: { in: activeEntries.map((e) => e.serviceId) },
                    organizationId,
                    isActive: true,
                    archivedAt: null,
                },
            });
        }

        if (!targetService) {
            return { offerDispatched: false, matchCount: 0 };
        }

        const location = await this.prisma.location.findFirst({
            where: { id: locationId, organizationId, archivedAt: null },
        });

        if (!location) {
            return { offerDispatched: false, matchCount: 0 };
        }

        let staffDisplayName = "Any Specialist";
        if (staffId) {
            const staffProfile = await this.prisma.staffProfile.findFirst({
                where: { id: staffId, organizationId, archivedAt: null },
            });
            if (staffProfile?.displayName) staffDisplayName = staffProfile.displayName;
        }

        const gapCandidate: ScheduleGapCandidateInput = {
            id: `${locationId}-${staffId || "any"}-${startAt.getTime()}`,
            organizationId,
            locationId,
            staffId: staffId || null,
            serviceId: targetService.id,
            serviceName: targetService.name,
            serviceDurationMin: targetService.durationMin,
            priceCents: targetService.priceCents,
            capacity: targetService.capacity || 1,
            startAt,
            endAt,
            timezone: location.timezone,
        };

        const scoringEntries: WaitlistEntryForScoring[] = activeEntries.map((e) => ({
            id: e.id,
            organizationId: e.organizationId,
            customerId: e.customerId,
            customerName: e.customer?.fullName || "Guest Customer",
            customerEmail: e.customer?.email,
            customerPhone: e.customer?.phone || undefined,
            serviceId: e.serviceId,
            locationId: e.locationId,
            staffId: e.staffId,
            allowFallbackStaff: e.allowFallbackStaff,
            startWindowDate: e.startWindowDate,
            endWindowDate: e.endWindowDate,
            timePreference: e.timePreference as any,
            customStartTimeMin: e.customStartTimeMin,
            customEndTimeMin: e.customEndTimeMin,
            partySize: e.partySize || 1,
            status: e.status,
            expiresAt: e.expiresAt,
            createdAt: e.createdAt,
            customerSpentCents: e.customer?.totalSpentCents || 0,
            customerCompletedBookingsCount: e.customer?.completedAppointmentsCount || 0,
        }));

        const scoredMatches = scoringEntries
            .map((entry) => this.scoringService.scoreCandidate(entry, gapCandidate))
            .filter((m): m is NonNullable<typeof m> => m !== null && m.totalScore > 0)
            .sort((a, b) => b.totalScore - a.totalScore);

        if (scoredMatches.length === 0) {
            return { offerDispatched: false, matchCount: 0 };
        }

        const dedupKey = GapDetectionService.computeDedupKey(
            organizationId,
            locationId,
            staffId,
            startAt,
            endAt
        );
        const gapDurationMin = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
        const potentialRevenueCents = targetService.priceCents;

        const insight = await this.prisma.scheduleInsight.upsert({
            where: {
                organizationId_dedupKey_status: {
                    organizationId,
                    dedupKey,
                    status: "ACTIVE",
                },
            },
            create: {
                organizationId,
                locationId,
                staffId: staffId || null,
                serviceId: targetService.id,
                startAt,
                endAt,
                gapDurationMin,
                potentialRevenueCents,
                candidateMatches: scoredMatches as any,
                aiExplanation: `Opening for ${targetService.name} with ${staffDisplayName} on ${startAt.toISOString().slice(0, 10)}. Top waitlist candidate: ${scoredMatches[0].customerName} (${scoredMatches[0].totalScore}% match).`,
                status: "ACTIVE",
                dedupKey,
                metadata: {
                    formulaVersion: DeterministicScoringService.FORMULA_VERSION,
                    matchCount: scoredMatches.length,
                    autoGenerated: true,
                },
            },
            update: {
                candidateMatches: scoredMatches as any,
                potentialRevenueCents,
                updatedAt: new Date(),
            },
        });

        const topMatch = scoredMatches[0];

        // Autonomous auto-offer dispatch when autoOfferEnabled is active and candidate totalScore >= 70
        if (org.autoOfferEnabled && topMatch.totalScore >= 70) {
            try {
                const actionResult = await this.actionInsight(organizationId, insight.id, {
                    selectedEntryId: topMatch.waitlistEntryId,
                    expiresInMinutes: 60,
                });
                this.logger.log(
                    `[AutonomousOptimizer] Auto-dispatched offer ${actionResult.offer.id} for opened slot to entry ${topMatch.waitlistEntryId} (Score: ${topMatch.totalScore})`
                );
                return {
                    insightId: insight.id,
                    offerDispatched: true,
                    offerId: actionResult.offer.id,
                    candidateEntryId: topMatch.waitlistEntryId,
                    matchCount: scoredMatches.length,
                };
            } catch (err: any) {
                this.logger.warn(`[AutonomousOptimizer] Failed to auto-dispatch offer: ${err.message}`);
            }
        }

        return {
            insightId: insight.id,
            offerDispatched: false,
            matchCount: scoredMatches.length,
        };
    }

    /**
     * Cascades an offer opening to the next best candidate in line
     */
    async cascadeOfferToNextCandidate(
        organizationId: string,
        slotDetails: {
            locationId: string;
            staffId?: string | null;
            serviceId: string;
            startAt: Date;
            endAt: Date;
            excludeWaitlistEntryId?: string;
        },
    ): Promise<{ offerDispatched: boolean; nextEntryId?: string }> {
        const result = await this.processSlotOpening(
            organizationId,
            slotDetails.locationId,
            slotDetails.staffId,
            slotDetails.startAt,
            slotDetails.endAt,
            slotDetails.serviceId,
            slotDetails.excludeWaitlistEntryId,
        );

        return {
            offerDispatched: result.offerDispatched,
            nextEntryId: result.candidateEntryId,
        };
    }
}
