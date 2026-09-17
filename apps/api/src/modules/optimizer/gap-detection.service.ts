import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../database/prisma.service";
import { AvailabilityService } from "../availability/availability.service";
import { BusyIntervalRepository } from "../availability/busy-interval-repository";
import {
    DeterministicScoringService,
    ScheduleGapCandidateInput,
    WaitlistEntryForScoring,
} from "./deterministic-scoring.service";
import { AIOptimizerExplanationService } from "./ai-optimizer-explanation.service";
import { ScanGapsInput, ScheduleInsightDto } from "@bookpro/contracts";

@Injectable()
export class GapDetectionService {
    private readonly logger = new Logger(GapDetectionService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly availabilityService: AvailabilityService,
        private readonly busyIntervalRepo: BusyIntervalRepository,
        private readonly scoringService: DeterministicScoringService,
        private readonly aiExplanationService: AIOptimizerExplanationService,
    ) {}

    /**
     * Generates a stable deduplication key for an identified gap.
     */
    static computeDedupKey(
        orgId: string,
        locId: string,
        staffId: string | null | undefined,
        startAt: Date,
        endAt: Date
    ): string {
        const raw = `${orgId}:${locId}:${staffId || "any"}:${startAt.toISOString()}:${endAt.toISOString()}`;
        return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
    }

    /**
     * Scans for schedule openings and evaluates waitlist matches.
     */
    async scanAndDetectGaps(organizationId: string, input: ScanGapsInput = {}): Promise<ScheduleInsightDto[]> {
        const org = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            include: { locations: { where: { archivedAt: null } } },
        });

        if (!org) {
            return [];
        }

        const minGapMin = org.optimizerMinGapMin || 30;
        const now = new Date();

        // 1. Determine date window (default today -> +7 days)
        const startDate = input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : now;
        const endDate = input.endDate
            ? new Date(`${input.endDate}T23:59:59.999Z`)
            : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // 2. Fetch active services, locations, and staff
        const [services, locations, staffProfiles, activeWaitlistEntries] = await Promise.all([
            this.prisma.service.findMany({
                where: { organizationId, isActive: true, archivedAt: null },
            }),
            this.prisma.location.findMany({
                where: {
                    organizationId,
                    archivedAt: null,
                    ...(input.locationId ? { id: input.locationId } : {}),
                },
            }),
            this.prisma.staffProfile.findMany({
                where: {
                    organizationId,
                    archivedAt: null,
                    ...(input.staffId ? { id: input.staffId } : {}),
                },
                include: {
                    membership: { include: { user: true } },
                    availabilities: true,
                    breaks: true,
                    leaves: true,
                },
            }),
            this.prisma.waitlistEntry.findMany({
                where: {
                    organizationId,
                    status: "ACTIVE",
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
                include: { customer: true, service: true },
            }),
        ]);

        if (services.length === 0 || locations.length === 0 || staffProfiles.length === 0) {
            return [];
        }

        const scoringEntries: WaitlistEntryForScoring[] = activeWaitlistEntries.map((e) => ({
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

        const detectedInsights: any[] = [];

        // 3. For each location and staff, compute available candidate openings
        for (const loc of locations) {
            for (const staff of staffProfiles) {
                // Check if staff works at this location
                for (const service of services) {
                    try {
                        const slotsResult = await this.availabilityService.searchAvailability({
                            organizationId,
                            locationId: loc.id,
                            serviceId: service.id,
                            staffId: staff.id,
                            startDate: startDate.toISOString().slice(0, 10),
                            endDate: endDate.toISOString().slice(0, 10),
                            presentationTimezone: loc.timezone || "UTC",
                            partySize: 1,
                        });

                        const candidateSlots = slotsResult.slots || [];
                        if (candidateSlots.length === 0) continue;

                        // Sample up to top 3 discrete gap openings
                        const topSlots = candidateSlots.slice(0, 3);

                        for (const slot of topSlots) {
                            const startAt = new Date(slot.startTime);
                            const endAt = new Date(slot.endTime);

                            if (startAt < now) continue;

                            const gapCandidate: ScheduleGapCandidateInput = {
                                id: `${loc.id}-${staff.id}-${startAt.getTime()}`,
                                organizationId,
                                locationId: loc.id,
                                staffId: staff.id,
                                serviceId: service.id,
                                serviceName: service.name,
                                serviceDurationMin: service.durationMin,
                                priceCents: service.priceCents,
                                capacity: service.capacity || 1,
                                startAt,
                                endAt,
                                timezone: loc.timezone,
                            };

                            // Score all active waitlist entries against this gap
                            const scoredMatches = scoringEntries
                                .map((entry) => this.scoringService.scoreCandidate(entry, gapCandidate))
                                .filter((m): m is NonNullable<typeof m> => m !== null && m.totalScore > 0)
                                .sort((a, b) => b.totalScore - a.totalScore);

                            // Even if 0 waitlist entries, record as an underutilized gap if revenue potential exists
                            const dedupKey = GapDetectionService.computeDedupKey(
                                organizationId,
                                loc.id,
                                staff.id,
                                startAt,
                                endAt
                            );

                            const gapDurationMin = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
                            const potentialRevenueCents = service.priceCents;

                            // Generate AI manager explanation
                            const aiExplanation = await this.aiExplanationService.generateExplanation({
                                locationName: loc.name,
                                staffName: staff.displayName || staff.membership?.user?.fullName || null,
                                serviceName: service.name,
                                gapDurationMin,
                                startAt,
                                endAt,
                                potentialRevenueCents,
                                topMatches: scoredMatches.slice(0, 3),
                            });

                            // Upsert active insight using dedupKey
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
                                    locationId: loc.id,
                                    staffId: staff.id,
                                    serviceId: service.id,
                                    startAt,
                                    endAt,
                                    gapDurationMin,
                                    potentialRevenueCents,
                                    candidateMatches: scoredMatches as any,
                                    aiExplanation,
                                    status: "ACTIVE",
                                    dedupKey,
                                    metadata: {
                                        formulaVersion: DeterministicScoringService.FORMULA_VERSION,
                                        matchCount: scoredMatches.length,
                                    },
                                },
                                update: {
                                    candidateMatches: scoredMatches as any,
                                    aiExplanation,
                                    potentialRevenueCents,
                                    updatedAt: new Date(),
                                },
                                include: {
                                    location: true,
                                    staff: { include: { membership: { include: { user: true } } } },
                                    service: true,
                                },
                            });

                            detectedInsights.push(this.toDto(insight));
                        }
                    } catch (error: any) {
                        this.logger.warn(`[GapDetection] Failed scanning staff ${staff.id} at location ${loc.id}: ${error.message}`);
                    }
                }
            }
        }

        return detectedInsights;
    }

    /**
     * Invalidate insights that overlap with a new appointment, hold, or leave.
     */
    async invalidateOverlappingInsights(
        organizationId: string,
        locationId: string,
        staffId: string | null | undefined,
        startAt: Date,
        endAt: Date
    ): Promise<number> {
        const result = await this.prisma.scheduleInsight.updateMany({
            where: {
                organizationId,
                locationId,
                ...(staffId ? { staffId } : {}),
                status: "ACTIVE",
                startAt: { lt: endAt },
                endAt: { gt: startAt },
            },
            data: {
                status: "STALE",
                staleAt: new Date(),
            },
        });

        if (result.count > 0) {
            this.logger.log(`[GapDetection] Invalidated ${result.count} stale schedule insights for staff=${staffId} location=${locationId}`);
        }

        return result.count;
    }

    public toDto(record: any): ScheduleInsightDto {
        return {
            id: record.id,
            organizationId: record.organizationId,
            locationId: record.locationId,
            locationName: record.location?.name,
            staffId: record.staffId,
            staffName: record.staff?.displayName || record.staff?.membership?.user?.fullName || null,
            serviceId: record.serviceId,
            serviceName: record.service?.name || null,
            startAt: record.startAt.toISOString(),
            endAt: record.endAt.toISOString(),
            gapDurationMin: record.gapDurationMin,
            potentialRevenueCents: record.potentialRevenueCents,
            candidateMatches: (record.candidateMatches || []) as any,
            aiExplanation: record.aiExplanation,
            status: record.status,
            actionedAt: record.actionedAt?.toISOString() || null,
            actionedOfferId: record.actionedOfferId || null,
            dismissedAt: record.dismissedAt?.toISOString() || null,
            dismissedBy: record.dismissedBy || null,
            staleAt: record.staleAt?.toISOString() || null,
            createdAt: record.createdAt.toISOString(),
            updatedAt: record.updatedAt.toISOString(),
        };
    }
}
