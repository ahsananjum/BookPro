/**
 * BookPro Phase P12 — Analytics, Operational Features, Search, Reporting & Platform Support Contracts
 */

// ==========================================
// 1. ANALYTICS & READ MODEL CONTRACTS
// ==========================================

export interface OrgDailyMetricDto {
    id: string;
    organizationId: string;
    date: string; // YYYY-MM-DD
    currency: string;
    bookedRevenueCents: number;
    collectedRevenueCents: number;
    refundedRevenueCents: number;
    netCollectedRevenueCents: number;
    bookingCount: number;
    completedCount: number;
    cancelledCount: number;
    noShowCount: number;
    totalAvailableMinutes: number;
    totalBookedMinutes: number;
    utilizationRate: number; // percentage 0.0 - 100.0
    averageBookingValueCents: number;
    newCustomersCount: number;
    returningCustomersCount: number;
    recoveredWaitlistRevenueCents: number;
    createdAt: string;
    updatedAt: string;
}

export interface LocationDailyMetricDto {
    id: string;
    organizationId: string;
    locationId: string;
    locationName?: string;
    date: string;
    currency: string;
    bookedRevenueCents: number;
    collectedRevenueCents: number;
    bookingCount: number;
    completedCount: number;
    cancelledCount: number;
    noShowCount: number;
    totalAvailableMinutes: number;
    totalBookedMinutes: number;
    utilizationRate: number;
}

export interface StaffDailyMetricDto {
    id: string;
    organizationId: string;
    staffId: string;
    staffName?: string;
    date: string;
    currency: string;
    bookedRevenueCents: number;
    collectedRevenueCents: number;
    bookingCount: number;
    completedCount: number;
    cancelledCount: number;
    noShowCount: number;
    totalAvailableMinutes: number;
    totalBookedMinutes: number;
    utilizationRate: number;
}

export interface ServiceDailyMetricDto {
    id: string;
    organizationId: string;
    serviceId: string;
    serviceName?: string;
    date: string;
    currency: string;
    bookedRevenueCents: number;
    bookingCount: number;
    completedCount: number;
}

export interface WaitlistDailyMetricDto {
    id: string;
    organizationId: string;
    date: string;
    entriesCreated: number;
    offersDispatched: number;
    offersAccepted: number;
    recoveredRevenueCents: number;
    conversionRate: number;
}

export interface DashboardOverviewDto {
    period: {
        startDate: string;
        endDate: string;
        currency: string;
    };
    today: {
        bookingsCount: number;
        bookedRevenueCents: number;
        collectedRevenueCents: number;
        completedCount: number;
        cancelledCount: number;
        noShowCount: number;
        utilizationRate: number;
    };
    kpis: {
        totalBookedRevenueCents: number;
        totalCollectedRevenueCents: number;
        totalRefundedRevenueCents: number;
        netRevenueCents: number;
        pendingRevenueCents?: number;
        totalBookings: number;
        completedBookings: number;
        cancellationRate: number;
        noShowRate: number;
        overallUtilizationRate: number;
        averageBookingValueCents: number;
        newCustomersCount: number;
        returningCustomersCount: number;
        recoveredWaitlistRevenueCents: number;
        revenueGrowthPct?: number | null;
        bookingsGrowthPct?: number | null;
        collectedGrowthPct?: number | null;
    };
    statusBreakdown?: {
        completed: number;
        confirmed: number;
        inProgress: number;
        cancelled: number;
        noShow: number;
        hold: number;
    };
    capacityHours?: {
        totalBookableHours: number;
        totalBookedHours: number;
    };
    chartSeries: {
        dates: string[];
        bookedRevenue: number[];
        collectedRevenue: number[];
        bookingsCount: number[];
        utilization: number[];
        completedCount?: number[];
        cancelledCount?: number[];
    };
    topServices: Array<{
        serviceId: string;
        serviceName: string;
        bookingsCount: number;
        revenueCents: number;
    }>;
    topStaff: Array<{
        staffId: string;
        staffName: string;
        bookingsCount: number;
        revenueCents: number;
        utilizationRate: number;
    }>;
    locationPerformance: Array<{
        locationId: string;
        locationName: string;
        bookingsCount: number;
        revenueCents: number;
        utilizationRate: number;
    }>;
    integrationWarnings: Array<{
        integrationType: string;
        status: string;
        message: string;
    }>;
}

export interface AnalyticsQueryInput {
    startDate?: string; // YYYY-MM-DD
    endDate?: string;   // YYYY-MM-DD
    locationId?: string;
    staffId?: string;
    serviceId?: string;
    currency?: string;
}

export interface AnalyticsRebuildInput {
    startDate?: string;
    endDate?: string;
    metricFamily?: "ALL" | "ORG" | "LOCATION" | "STAFF" | "SERVICE" | "WAITLIST";
}

export interface ProductAnalyticsEventDto {
    id: string;
    organizationId?: string | null;
    eventType: string;
    actorType: string;
    actorId?: string | null;
    sessionId?: string | null;
    metadata?: Record<string, any> | null;
    createdAt: string;
}

export interface CreateProductAnalyticsEventInput {
    eventType: string;
    sessionId?: string;
    metadata?: Record<string, any>;
}

// ==========================================
// 2. VERIFIED REVIEWS CONTRACTS
// ==========================================

export type ReviewStatus = "PUBLISHED" | "PENDING_MODERATION" | "HIDDEN";

export interface ReviewDto {
    id: string;
    organizationId: string;
    appointmentId: string;
    customerId: string;
    customerName?: string;
    serviceId?: string | null;
    serviceName?: string | null;
    staffId?: string | null;
    staffName?: string | null;
    locationId?: string | null;
    locationName?: string | null;
    rating: number; // 1 to 5
    comment?: string | null;
    status: ReviewStatus;
    createdAt: string;
    updatedAt: string;
}

export interface CreateReviewInput {
    appointmentId: string;
    rating: number;
    comment?: string;
}

export interface UpdateReviewInput {
    rating?: number;
    comment?: string;
    status?: ReviewStatus;
}

export interface ReviewListQueryInput {
    status?: ReviewStatus;
    serviceId?: string;
    staffId?: string;
    locationId?: string;
    limit?: number;
    offset?: number;
}

// ==========================================
// 3. QR CODE CHECK-IN CONTRACTS
// ==========================================

export interface QrCheckInPassDto {
    appointmentId: string;
    organizationId: string;
    locationId: string;
    locationName: string;
    serviceName: string;
    staffName?: string | null;
    startAt: string;
    endAt: string;
    qrToken: string;
    expiresAt: string;
    isEligibleNow: boolean;
    status?: string;
    isExpired?: boolean;
    isVoid?: boolean;
}

export interface VerifyQrCheckInInput {
    token: string;
}

export interface QrCheckInResultDto {
    success: boolean;
    appointmentId: string;
    checkedInAt: string;
    customerName: string;
    serviceName: string;
    staffName?: string | null;
    message: string;
}

// ==========================================
// 4. STAFF ATTENDANCE CONTRACTS
// ==========================================

export type AttendanceStatus = "ON_TIME" | "LATE" | "EARLY_DEPARTURE" | "CORRECTED";

export interface StaffAttendanceDto {
    id: string;
    organizationId: string;
    staffId: string;
    staffName?: string;
    locationId?: string | null;
    locationName?: string | null;
    shiftDate: string; // YYYY-MM-DD
    checkInAt: string;
    checkOutAt?: string | null;
    status: AttendanceStatus;
    latenessMinutes: number;
    managerNotes?: string | null;
    correctedBy?: string | null;
    correctedAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface StaffCheckInInput {
    locationId?: string;
    notes?: string;
}

export interface StaffCheckOutInput {
    notes?: string;
}

export interface ManagerCorrectAttendanceInput {
    checkInAt?: string;
    checkOutAt?: string;
    status?: AttendanceStatus;
    managerNotes: string;
}

export interface AttendanceQueryInput {
    staffId?: string;
    locationId?: string;
    startDate?: string;
    endDate?: string;
}

// ==========================================
// 5. REPORTING & EXPORTS CONTRACTS
// ==========================================

export type ExportType = "CUSTOMERS" | "APPOINTMENTS" | "PAYMENTS" | "REVENUE_REPORT";
export type ExportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface DataExportDto {
    id: string;
    organizationId: string;
    requestedBy: string;
    exportType: ExportType;
    status: ExportStatus;
    filters?: Record<string, any> | null;
    fileUrl?: string | null;
    fileSizeBytes?: number | null;
    rowCount?: number | null;
    expiresAt?: string | null;
    error?: string | null;
    createdAt: string;
    completedAt?: string | null;
}

export interface CreateExportInput {
    exportType: ExportType;
    startDate?: string;
    endDate?: string;
    locationId?: string;
}

// ==========================================
// 6. PLATFORM ADMIN & AUDIT CONTRACTS
// ==========================================

export interface PlatformSystemHealthDto {
    timestamp: string;
    database: { status: "HEALTHY" | "DEGRADED" | "DOWN"; latencyMs: number };
    redis: { status: "HEALTHY" | "DEGRADED" | "DOWN"; latencyMs: number };
    integrations: {
        googleCalendar: { connectedCount: number; failingCount: number };
        stripe: { webhooks24h: number; failures24h: number };
        geminiAI: { status: "ACTIVE" | "FALLBACK" | "DISABLED" };
    };
    jobQueues: {
        waiting: number;
        active: number;
        failed: number;
        delayed: number;
    };
    activeTenantsCount: number;
    totalBookings24h: number;
}

export interface PlatformTenantSummaryDto {
    id: string;
    name: string;
    slug: string;
    planCode: string;
    isActive: boolean;
    locationsCount: number;
    staffCount: number;
    monthlyBookingsCount: number;
    createdAt: string;
}

export interface PlatformFailedJobDto {
    id: string;
    queueName: string;
    name: string;
    organizationId?: string | null;
    failedReason: string;
    attemptsMade: number;
    timestamp: number;
}

export interface PlatformWebhookFailureDto {
    id: string;
    organizationId?: string | null;
    provider: string;
    eventId: string;
    eventType: string;
    status: string;
    lastError?: string | null;
    createdAt: string;
}

export interface PlatformSupportAccessInput {
    reason: string;
    targetTenantId: string;
}

export interface AuditLogDto {
    id: string;
    organizationId?: string | null;
    actorType: string;
    actorId: string;
    actorName?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    payload?: Record<string, any> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt: string;
}

export interface AuditLogQueryInput {
    actorType?: string;
    action?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}
