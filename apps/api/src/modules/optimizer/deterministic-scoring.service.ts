import { Injectable, Logger } from "@nestjs/common";
import {
    CandidateScoreBreakdown,
    ScoredCandidateMatch,
    TimeOfDayPreference,
} from "@bookpro/contracts";

export interface ScheduleGapCandidateInput {
    id: string;
    organizationId: string;
    locationId: string;
    staffId?: string | null;
    serviceId: string;
    serviceName: string;
    serviceDurationMin: number;
    priceCents: number;
    capacity: number;
    startAt: Date;
    endAt: Date;
    timezone?: string;
}

export interface WaitlistEntryForScoring {
    id: string;
    organizationId: string;
    customerId: string;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    serviceId: string;
    locationId?: string | null;
    staffId?: string | null;
    allowFallbackStaff: boolean;
    startWindowDate: Date;
    endWindowDate: Date;
    timePreference: TimeOfDayPreference;
    customStartTimeMin?: number | null;
    customEndTimeMin?: number | null;
    partySize: number;
    status: string;
    expiresAt?: Date | null;
    createdAt: Date;
    customerSpentCents?: number;
    customerCompletedBookingsCount?: number;
}

@Injectable()
export class DeterministicScoringService {
    private readonly logger = new Logger(DeterministicScoringService.name);
    public static readonly FORMULA_VERSION = "v1.0.0";

    /**
     * Evaluates hard eligibility before scoring.
     * Returns true if entry qualifies for the gap, false otherwise.
     */
    isEligible(entry: WaitlistEntryForScoring, gap: ScheduleGapCandidateInput): boolean {
        // 1. Active status check
        if (entry.status !== "ACTIVE") {
            return false;
        }

        // 2. Expiration check
        if (entry.expiresAt && entry.expiresAt < new Date()) {
            return false;
        }

        // 3. Service match
        if (entry.serviceId !== gap.serviceId) {
            return false;
        }

        // 4. Party size vs capacity
        if (entry.partySize > gap.capacity) {
            return false;
        }

        // 5. Location scope
        if (entry.locationId && entry.locationId !== gap.locationId) {
            return false;
        }

        // 6. Staff preference & fallback check
        if (entry.staffId && gap.staffId && entry.staffId !== gap.staffId) {
            if (!entry.allowFallbackStaff) {
                return false;
            }
        }

        // 7. Date window bounds check (date-only comparison in UTC / local)
        const gapDateStr = gap.startAt.toISOString().slice(0, 10);
        const startDateStr = entry.startWindowDate.toISOString().slice(0, 10);
        const endDateStr = entry.endWindowDate.toISOString().slice(0, 10);

        if (gapDateStr < startDateStr || gapDateStr > endDateStr) {
            return false;
        }

        // 8. Duration fit check: gap must accommodate service duration
        const gapDurationMin = Math.round((gap.endAt.getTime() - gap.startAt.getTime()) / 60000);
        if (gapDurationMin < gap.serviceDurationMin) {
            return false;
        }

        return true;
    }

    /**
     * Deterministic scoring calculation (0–100 rubric).
     * Strictly versioned and explainable. No protected attributes.
     */
    scoreCandidate(entry: WaitlistEntryForScoring, gap: ScheduleGapCandidateInput): ScoredCandidateMatch | null {
        if (!this.isEligible(entry, gap)) {
            return null;
        }

        const reasoning: string[] = [];

        // 1. Time Fit (0–30)
        let timeFit = 25; // default for ANY
        const gapStartHour = gap.startAt.getUTCHours(); // Or timezone adjusted

        if (entry.timePreference === "ANY") {
            timeFit = 25;
            reasoning.push("Flexible time-of-day preference matches opening (+25)");
        } else if (entry.timePreference === "MORNING") {
            if (gapStartHour < 12) {
                timeFit = 30;
                reasoning.push("Morning preference exactly matches morning slot (+30)");
            } else if (gapStartHour < 14) {
                timeFit = 15;
                reasoning.push("Adjacent early afternoon slot (+15)");
            } else {
                timeFit = 5;
                reasoning.push("Outside preferred morning window (+5)");
            }
        } else if (entry.timePreference === "AFTERNOON") {
            if (gapStartHour >= 12 && gapStartHour < 17) {
                timeFit = 30;
                reasoning.push("Afternoon preference exactly matches afternoon slot (+30)");
            } else if (gapStartHour >= 10 && gapStartHour < 19) {
                timeFit = 15;
                reasoning.push("Adjacent time slot (+15)");
            } else {
                timeFit = 5;
                reasoning.push("Outside preferred afternoon window (+5)");
            }
        } else if (entry.timePreference === "EVENING") {
            if (gapStartHour >= 17) {
                timeFit = 30;
                reasoning.push("Evening preference exactly matches evening slot (+30)");
            } else if (gapStartHour >= 15) {
                timeFit = 15;
                reasoning.push("Adjacent late afternoon slot (+15)");
            } else {
                timeFit = 5;
                reasoning.push("Outside preferred evening window (+5)");
            }
        }

        // 2. Preferred Staff Fit (0–20)
        let preferredStaffFit = 15;
        if (!entry.staffId) {
            preferredStaffFit = 15;
            reasoning.push("No staff preference specified; fits assigned provider (+15)");
        } else if (gap.staffId && entry.staffId === gap.staffId) {
            preferredStaffFit = 20;
            reasoning.push("Direct match on requested provider (+20)");
        } else if (entry.allowFallbackStaff) {
            preferredStaffFit = 10;
            reasoning.push("Fallback staff allowed by customer (+10)");
        }

        // 3. Location Fit (0–15)
        let locationFit = 12;
        if (entry.locationId && entry.locationId === gap.locationId) {
            locationFit = 15;
            reasoning.push("Exact requested salon location (+15)");
        } else {
            locationFit = 12;
            reasoning.push("Location accepted (+12)");
        }

        // 4. Service Exact Match (0–15)
        const serviceExactMatch = 15;
        reasoning.push(`Exact service match: ${gap.serviceName} (+15)`);

        // 5. Waitlist Age (0–10)
        const ageHours = (Date.now() - entry.createdAt.getTime()) / (1000 * 60 * 60);
        let waitlistAge = 2;
        if (ageHours >= 14 * 24) {
            waitlistAge = 10;
            reasoning.push("Waitlist senior entry (>= 14 days) (+10)");
        } else if (ageHours >= 7 * 24) {
            waitlistAge = 8;
            reasoning.push("Waitlist entry (>= 7 days) (+8)");
        } else if (ageHours >= 3 * 24) {
            waitlistAge = 6;
            reasoning.push("Waitlist entry (>= 3 days) (+6)");
        } else if (ageHours >= 24) {
            waitlistAge = 4;
            reasoning.push("Waitlist entry (>= 24 hours) (+4)");
        } else {
            waitlistAge = 2;
            reasoning.push("Recent waitlist entry (< 24 hours) (+2)");
        }

        // 6. Business Priority / Value (0–10)
        let businessPriority = 5;
        const price = gap.priceCents || 0;
        if (price >= 20000) {
            businessPriority = 10;
            reasoning.push("High-value appointment recovery potential ($200+) (+10)");
        } else if (price >= 10000) {
            businessPriority = 8;
            reasoning.push("Medium-value appointment recovery potential ($100+) (+8)");
        } else if (price >= 5000) {
            businessPriority = 6;
            reasoning.push("Standard appointment value (+6)");
        } else {
            businessPriority = 5;
            reasoning.push("Base priority score (+5)");
        }

        const breakdown: CandidateScoreBreakdown = {
            timeFit,
            preferredStaffFit,
            locationFit,
            serviceExactMatch,
            waitlistAge,
            businessPriority,
        };

        const totalScore = Math.min(
            100,
            Math.max(
                0,
                timeFit + preferredStaffFit + locationFit + serviceExactMatch + waitlistAge + businessPriority
            )
        );

        return {
            waitlistEntryId: entry.id,
            customerId: entry.customerId,
            customerName: entry.customerName,
            customerEmail: entry.customerEmail,
            customerPhone: entry.customerPhone,
            serviceId: gap.serviceId,
            serviceName: gap.serviceName,
            serviceDurationMin: gap.serviceDurationMin,
            priceCents: gap.priceCents,
            totalScore,
            breakdown,
            formulaVersion: DeterministicScoringService.FORMULA_VERSION,
            reasoning,
        };
    }
}
