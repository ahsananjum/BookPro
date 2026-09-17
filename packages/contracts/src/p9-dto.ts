/**
 * BookPro Phase P9 — Waitlist Foundation & Offer Lifecycle Contracts
 * PRD §§36–37, Architecture §§86, 90, 260–262, 321–322, 420, 447, 473
 */

export type WaitlistEntryStatus =
    | "ACTIVE"
    | "OFFERED"
    | "BOOKED"
    | "EXPIRED"
    | "CANCELLED";

export type WaitlistOfferStatus =
    | "PENDING"
    | "ACCEPTED"
    | "EXPIRED"
    | "REVOKED"
    | "LOST_TO_ANOTHER_CUSTOMER";

export type TimeOfDayPreference =
    | "ANY"
    | "MORNING"
    | "AFTERNOON"
    | "EVENING";

// ==========================================
// Waitlist Entry DTOs
// ==========================================

export interface JoinWaitlistInput {
    idempotencyKey?: string;
    organizationId?: string;
    serviceId: string;
    locationId?: string | null;
    staffId?: string | null;
    allowFallbackStaff?: boolean;
    startWindowDate: string; // YYYY-MM-DD
    endWindowDate: string;   // YYYY-MM-DD
    timePreference?: TimeOfDayPreference;
    customStartTimeMin?: number | null;
    customEndTimeMin?: number | null;
    partySize?: number;
    notes?: string | null;
    notificationChannels?: string[];
    customerId?: string;
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
}

export interface UpdateWaitlistEntryInput {
    serviceId?: string;
    locationId?: string | null;
    staffId?: string | null;
    allowFallbackStaff?: boolean;
    startWindowDate?: string;
    endWindowDate?: string;
    timePreference?: TimeOfDayPreference;
    customStartTimeMin?: number | null;
    customEndTimeMin?: number | null;
    partySize?: number;
    notes?: string | null;
    notificationChannels?: string[];
}

export interface WaitlistEntryDto {
    id: string;
    organizationId: string;
    customerId: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    serviceId: string;
    serviceName?: string;
    serviceDurationMin?: number;
    servicePriceCents?: number;
    locationId?: string | null;
    locationName?: string | null;
    staffId?: string | null;
    staffName?: string | null;
    allowFallbackStaff: boolean;
    startWindowDate: string;
    endWindowDate: string;
    timePreference: TimeOfDayPreference;
    customStartTimeMin?: number | null;
    customEndTimeMin?: number | null;
    partySize: number;
    notes?: string | null;
    notificationChannels: string[];
    status: WaitlistEntryStatus;
    expiresAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

// ==========================================
// Waitlist Offer DTOs
// ==========================================

export interface CreateManualOfferInput {
    waitlistEntryId: string;
    startAt: string; // ISO-8601 string
    endAt?: string;   // ISO-8601 string
    staffId?: string | null;
    locationId?: string | null;
    expiresInMinutes?: number;
}

export interface WaitlistOfferDto {
    id: string;
    organizationId: string;
    waitlistEntryId: string;
    serviceId: string;
    serviceName?: string;
    locationId: string;
    locationName?: string;
    staffId?: string | null;
    staffName?: string | null;
    startAt: string;
    endAt: string;
    score: number;
    scoreExplanation?: any;
    token: string;
    status: WaitlistOfferStatus;
    bookingHoldId?: string | null;
    appointmentId?: string | null;
    expiresAt: string;
    acceptedAt?: string | null;
    revokedAt?: string | null;
    createdAt: string;
    updatedAt?: string;
}

export interface OfferPublicPreviewDto {
    offerId: string;
    token: string;
    organizationId: string;
    organizationName: string;
    serviceId: string;
    serviceName: string;
    serviceDurationMin: number;
    priceCents: number;
    depositRequiredCents: number;
    staffId?: string | null;
    staffName?: string;
    locationId: string;
    locationName: string;
    locationAddress?: string;
    startAt: string;
    endAt: string;
    expiresAt: string;
    isExpired: boolean;
    status: WaitlistOfferStatus;
    requiresPayment: boolean;
}

// ==========================================
// Offer Acceptance DTOs
// ==========================================

export interface AcceptOfferInput {
    token: string;
    customerId?: string;
    idempotencyKey?: string;
}

export interface OfferAcceptanceResultDto {
    success: boolean;
    status: WaitlistOfferStatus;
    offerId: string;
    appointmentId?: string;
    bookingHoldId?: string;
    clientSecret?: string;
    paymentIntentId?: string;
    requiresPayment: boolean;
    message: string;
}

// ==========================================
// AI Receptionist Facade (P10 Readiness)
// ==========================================

export interface JoinWaitlistFacadeInput {
    organizationId: string;
    serviceNameOrId: string;
    customerEmail: string;
    customerName: string;
    customerPhone?: string;
    preferredDateRange: {
        start: string; // YYYY-MM-DD
        end: string;   // YYYY-MM-DD
    };
    preferredStaffNameOrId?: string;
    timeOfDay?: TimeOfDayPreference;
    notes?: string;
}

export interface JoinWaitlistFacadeResult {
    success: boolean;
    waitlistEntryId: string;
    serviceName: string;
    dateWindow: string;
    status: WaitlistEntryStatus;
    summary: string;
}

// ==========================================
// Upgraded Autonomous Waitlist & Smart Reschedule DTOs
// ==========================================

export interface DeclineOfferInput {
    token: string;
    reason?: string;
    removeFromWaitlist?: boolean;
}

export interface CustomerActiveOfferDto {
    offerId: string;
    token: string;
    organizationId: string;
    organizationName?: string;
    waitlistEntryId: string;
    serviceId: string;
    serviceName: string;
    serviceDurationMin: number;
    priceCents: number;
    depositRequiredCents: number;
    staffId?: string | null;
    staffName?: string;
    locationId: string;
    locationName: string;
    locationAddress?: string;
    startAt: string;
    endAt: string;
    expiresAt: string;
    status: WaitlistOfferStatus;
    score: number;
    requiresPayment: boolean;
}

export interface WaitlistHoldBlockDto {
    id: string;
    offerId: string;
    waitlistEntryId: string;
    customerName: string;
    serviceName: string;
    staffId?: string | null;
    staffName?: string;
    locationId: string;
    startAt: string;
    endAt: string;
    expiresAt: string;
    score: number;
    status: "PENDING" | "HELD";
}

export interface SmartRescheduleWaitlistInput {
    appointmentId: string;
    preferredDateRange: {
        start: string; // YYYY-MM-DD
        end: string;   // YYYY-MM-DD
    };
    timePreference?: TimeOfDayPreference;
    staffId?: string | null;
    notes?: string;
}
