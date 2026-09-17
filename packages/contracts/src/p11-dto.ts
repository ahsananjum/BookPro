/**
 * BookPro Phase P11 — Schedule Optimizer, Smart Waitlist Automation & No-Show Signal Contracts
 * PRD §§42–45, Architecture §§87–93, 110, 371–376, 420, 447
 */

export type ScheduleInsightStatus =
    | "ACTIVE"
    | "STALE"
    | "ACTIONED"
    | "DISMISSED";

export interface CandidateScoreBreakdown {
    timeFit: number;          // 0–30
    preferredStaffFit: number;// 0–20
    locationFit: number;      // 0–15
    serviceExactMatch: number;// 0–15
    waitlistAge: number;      // 0–10
    businessPriority: number; // 0–10
}

export interface ScoredCandidateMatch {
    waitlistEntryId: string;
    customerId: string;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    serviceId: string;
    serviceName: string;
    serviceDurationMin: number;
    priceCents: number;
    totalScore: number;       // 0–100
    breakdown: CandidateScoreBreakdown;
    formulaVersion: string;   // e.g. "v1.0.0"
    reasoning: string[];
}

export interface ScheduleInsightDto {
    id: string;
    organizationId: string;
    locationId: string;
    locationName?: string;
    staffId?: string | null;
    staffName?: string | null;
    serviceId?: string | null;
    serviceName?: string | null;
    startAt: string;          // ISO-8601
    endAt: string;            // ISO-8601
    gapDurationMin: number;
    potentialRevenueCents: number;
    candidateMatches: ScoredCandidateMatch[];
    aiExplanation?: string | null;
    status: ScheduleInsightStatus;
    actionedAt?: string | null;
    actionedOfferId?: string | null;
    dismissedAt?: string | null;
    dismissedBy?: string | null;
    staleAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ScanGapsInput {
    locationId?: string;
    staffId?: string;
    startDate?: string;       // YYYY-MM-DD
    endDate?: string;         // YYYY-MM-DD
    forceRecompute?: boolean;
}

export interface ActionInsightInput {
    selectedEntryId?: string;
    expiresInMinutes?: number;
}

export interface DismissInsightInput {
    reason?: string;
}

export interface OptimizerSettingsDto {
    autoOfferEnabled: boolean;
    noShowSignalEnabled: boolean;
    optimizerMinGapMin: number;
}

export interface UpdateOptimizerSettingsInput {
    autoOfferEnabled?: boolean;
    noShowSignalEnabled?: boolean;
    optimizerMinGapMin?: number;
}

export interface NoShowRiskFactors {
    noShowCount: number;
    lateCancellationCount: number;
    depositPaid: boolean;
    leadTimeHours: number;
    isUnconfirmed: boolean;
}

export interface NoShowRiskSignalDto {
    customerId: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    riskScore: number;        // 0–100
    factors: NoShowRiskFactors;
    explanation: string;
    permittedFactorsOnly: boolean;
}

export interface RecoveredRevenueStatsDto {
    totalRecoveredRevenueCents: number;
    recoveredBookingsCount: number;
    averageRecoveredBookingCents: number;
    activeOpportunitiesCount: number;
    potentialRevenueCents: number;
}
