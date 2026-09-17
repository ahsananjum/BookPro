import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoInstant = z.string().datetime({ offset: true });

export const createAIConversationSchema = z.object({
    channel: z.enum(["TEXT", "VOICE"]).default("TEXT"),
    scope: z.enum(["CUSTOMER", "OWNER"]).default("CUSTOMER"),
}).strict();

export const sendAIMessageSchema = z.object({
    message: z.string().trim().min(1).max(20000),
    idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export const confirmAIProposalSchema = z.object({
    confirmationToken: z.string().min(32).max(256),
    idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export const aiToolSchemas = {
    // ----------------------------------------------------
    // CUSTOMER CONCIERGE & RECEPTIONIST TOOLS
    // ----------------------------------------------------
    getLocations: z.object({ query: z.string().trim().max(120).optional() }).strict(),
    getServices: z.object({ query: z.string().trim().max(120).optional(), locationId: uuid.optional() }).strict(),
    findAvailability: z.object({
        serviceId: z.string().trim().min(1).max(120).optional(),
        locationId: uuid.optional(),
        staffId: uuid.optional(),
        startDate: z.string().trim().min(3).max(40).optional(),
        endDate: z.string().trim().min(3).max(40).optional(),
        timezone: z.string().min(1).max(80).optional(),
        partySize: z.number().int().min(1).max(100).default(1),
    }).strict(),
    getBooking: z.object({ bookingId: uuid }).strict(),
    createBookingHold: z.object({
        serviceId: z.string().trim().min(1).max(120),
        locationId: uuid.optional(),
        staffId: uuid.optional(),
        startAt: isoInstant,
        endAt: isoInstant,
        partySize: z.number().int().min(1).max(100).default(1),
        guestName: z.string().trim().min(1).max(120).optional(),
        guestEmail: z.string().email().max(254).optional(),
        guestPhone: z.string().trim().max(40).optional(),
    }).strict(),
    releaseBookingHold: z.object({
        holdId: uuid.optional(),
        reason: z.string().trim().max(200).optional(),
    }).strict(),
    confirmBooking: z.object({ holdId: uuid }).strict(),
    rescheduleBooking: z.object({
        bookingId: uuid,
        newStartAt: isoInstant,
        newEndAt: isoInstant.optional(),
        newStaffId: uuid.optional(),
        autoAssignSpecialist: z.boolean().default(true).optional(),
    }).strict(),
    autoRescheduleAppointment: z.object({
        bookingId: uuid.optional(),
        preferredDate: isoDate.optional(),
        timePreference: z.enum(["ANY", "MORNING", "AFTERNOON", "EVENING"]).default("ANY").optional(),
        allowAnySpecialist: z.boolean().default(true).optional(),
    }).strict(),
    cancelBooking: z.object({ bookingId: uuid, reason: z.string().trim().max(500).optional() }).strict(),
    joinWaitlist: z.object({
        serviceId: z.string().trim().min(1).max(120),
        locationId: uuid.optional(),
        staffId: uuid.optional(),
        allowFallbackStaff: z.boolean().default(true),
        startWindowDate: isoDate,
        endWindowDate: isoDate,
        timePreference: z.enum(["ANY", "MORNING", "AFTERNOON", "EVENING"]).default("ANY"),
        partySize: z.number().int().min(1).max(100).default(1),
        notes: z.string().trim().max(500).optional(),
        guestName: z.string().trim().min(1).max(120).optional(),
        guestEmail: z.string().email().max(254).optional(),
        guestPhone: z.string().trim().max(40).optional(),
    }).strict(),
    getOrganizationInfo: z.object({}).strict(),
    getMyAccountSummary: z.object({}).strict(),
    getMyUpcomingAppointments: z.object({
        status: z.enum(["UPCOMING", "PAST", "ALL"]).default("UPCOMING"),
        limit: z.number().int().min(1).max(20).default(5),
    }).strict(),
    getMyBookingHolds: z.object({}).strict(),
    getMyWaitlistStatus: z.object({}).strict(),
    getMyBillingHistory: z.object({
        limit: z.number().int().min(1).max(50).default(10),
    }).strict(),
    getOrganizationPolicies: z.object({
        locationId: uuid.optional(),
        serviceId: uuid.optional(),
    }).strict(),
    getServiceDetails: z.object({
        serviceId: uuid,
    }).strict(),
    leaveWaitlist: z.object({
        waitlistEntryId: uuid,
        reason: z.string().trim().max(300).optional(),
    }).strict(),

    // ----------------------------------------------------
    // OWNER & STAFF OPERATIONS CO-PILOT TOOLS
    // ----------------------------------------------------
    getBusinessOverview: z.object({
        locationId: uuid.optional(),
        period: z.enum(["today", "week", "month"]).default("today"),
    }).strict(),
    getAppointmentsAgenda: z.object({
        startDate: z.string().trim().max(40).optional(),
        endDate: z.string().trim().max(40).optional(),
        locationId: uuid.optional(),
        staffId: uuid.optional(),
        status: z.string().trim().max(40).optional(),
    }).strict(),
    scheduleStaffAppointment: z.object({
        locationId: uuid.optional(),
        serviceId: z.string().trim().min(1).max(120),
        staffId: uuid.optional(),
        startAt: isoInstant,
        endAt: isoInstant.optional(),
        customerName: z.string().trim().min(1).max(120),
        customerEmail: z.string().email().max(254).optional(),
        customerPhone: z.string().trim().max(40).optional(),
        paymentStatus: z.enum(["UNPAID", "PAID", "PARTIALLY_PAID", "DEPOSIT_PAID"]).default("UNPAID").optional(),
        internalNotes: z.string().trim().max(500).optional(),
        overrideReason: z.string().trim().max(200).optional(),
    }).strict(),
    rescheduleStaffAppointment: z.object({
        appointmentId: uuid,
        newStartAt: isoInstant,
        newEndAt: isoInstant.optional(),
        newStaffId: uuid.optional(),
        reason: z.string().trim().max(300).optional(),
    }).strict(),
    cancelStaffAppointment: z.object({
        appointmentId: uuid,
        reason: z.string().trim().min(1).max(500),
    }).strict(),
    updateAppointmentStatus: z.object({
        appointmentId: uuid,
        status: z.enum(["CHECKED_IN", "IN_PROGRESS", "COMPLETED", "NO_SHOW"]),
    }).strict(),
    listBusinessServices: z.object({
        category: z.string().trim().max(80).optional(),
        activeOnly: z.boolean().default(false),
    }).strict(),
    createBusinessService: z.object({
        name: z.string().trim().min(1).max(120),
        category: z.string().trim().min(1).max(80),
        description: z.string().trim().max(1000).optional(),
        durationMin: z.number().int().min(5).max(1440),
        priceCents: z.number().int().min(0),
        currency: z.string().trim().max(10).default("USD"),
        depositType: z.enum(["NONE", "FIXED", "PERCENTAGE"]).default("NONE"),
        depositValue: z.number().int().min(0).default(0),
        preBufferMin: z.number().int().min(0).max(120).default(0),
        postBufferMin: z.number().int().min(0).max(120).default(0),
    }).strict(),
    updateBusinessService: z.object({
        serviceId: uuid,
        name: z.string().trim().min(1).max(120).optional(),
        priceCents: z.number().int().min(0).optional(),
        durationMin: z.number().int().min(5).max(1440).optional(),
        isActive: z.boolean().optional(),
        description: z.string().trim().max(1000).optional(),
        depositType: z.enum(["NONE", "FIXED", "PERCENTAGE"]).optional(),
        depositValue: z.number().int().min(0).optional(),
    }).strict(),
    getStaffRoster: z.object({
        locationId: uuid.optional(),
        activeOnly: z.boolean().default(false),
    }).strict(),
    getStaffSchedule: z.object({
        staffId: uuid,
        date: z.string().trim().max(40).optional(),
    }).strict(),
    updateStaffStatus: z.object({
        staffId: uuid,
        isActive: z.boolean().optional(),
        bookingVisible: z.boolean().optional(),
        title: z.string().trim().max(100).optional(),
    }).strict(),
    searchCustomers: z.object({
        query: z.string().trim().max(120).optional(),
        tag: z.string().trim().max(50).optional(),
        limit: z.number().int().min(1).max(50).default(10),
    }).strict(),
    getCustomerProfile: z.object({
        customerId: uuid,
    }).strict(),
    addCustomerInternalNote: z.object({
        customerId: uuid,
        note: z.string().trim().min(1).max(1000),
    }).strict(),
    tagCustomer: z.object({
        customerId: uuid,
        tag: z.string().trim().min(1).max(50),
        action: z.enum(["ADD", "REMOVE"]),
    }).strict(),
    getWaitlistQueue: z.object({
        serviceId: uuid.optional(),
        locationId: uuid.optional(),
        status: z.string().trim().max(40).optional(),
    }).strict(),
    issueManualWaitlistOffer: z.object({
        waitlistEntryId: uuid,
        slotStartAt: isoInstant,
        slotEndAt: isoInstant,
        staffId: uuid.optional(),
        expiryMinutes: z.number().int().min(5).max(1440).default(60),
    }).strict(),
    getScheduleGapsAndRecovery: z.object({
        locationId: uuid.optional(),
        startDate: z.string().trim().max(40).optional(),
        endDate: z.string().trim().max(40).optional(),
    }).strict(),
    getScheduleInsights: z.object({
        status: z.enum(["PENDING", "ACTIONED", "DISMISSED"]).optional(),
    }).strict(),
    getMarketingTelemetry: z.object({}).strict(),
    createDiscountCoupon: z.object({
        code: z.string().trim().min(3).max(30),
        discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
        discountValue: z.number().int().min(1),
        validUntil: z.string().trim().max(40).optional(),
        usageLimit: z.number().int().min(1).optional(),
        description: z.string().trim().max(250).optional(),
    }).strict(),
    getCommissionsReport: z.object({
        periodStart: z.string().trim().max(40).optional(),
        periodEnd: z.string().trim().max(40).optional(),
        staffId: uuid.optional(),
    }).strict(),
    getBusinessPolicies: z.object({
        locationId: uuid.optional(),
        serviceId: uuid.optional(),
    }).strict(),
    updateBusinessPolicy: z.object({
        minNoticeHours: z.number().int().min(0).max(720).optional(),
        cancelCutoffHours: z.number().int().min(0).max(720).optional(),
        cancelFeeType: z.enum(["NONE", "FIXED", "PERCENTAGE"]).optional(),
        cancelFeeValue: z.number().int().min(0).optional(),
        rescheduleCutoffHours: z.number().int().min(0).max(720).optional(),
        holdDurationMinutes: z.number().int().min(1).max(120).optional(),
    }).strict(),
} as const;

export type AIToolName = keyof typeof aiToolSchemas;

// ==========================================
// P0-02 Public Booking & Payment Authority Schemas
// ==========================================

export const publicCreateHoldSchema = z.object({
    organizationId: uuid.optional(),
    locationId: uuid,
    serviceId: uuid,
    staffId: uuid.optional().nullable(),
    startAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
    endAt: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
    partySize: z.number().int().min(1).max(100).default(1),
    guestName: z.string().trim().min(1).max(120).optional().nullable(),
    guestEmail: z.string().email().max(254).optional().nullable(),
    guestPhone: z.string().trim().max(40).optional().nullable(),
    idempotencyKey: z.string().trim().min(8).max(128).optional().nullable(),
}).strict();

export const publicFinalizeBookingSchema = z.object({
    organizationId: uuid.optional(),
    bookingHoldId: uuid,
    guestToken: z.string().trim().min(16).max(512).optional().nullable(),
    intakeResponses: z.array(z.object({
        intakeFormId: uuid,
        responses: z.record(z.any()),
    })).optional(),
    idempotencyKey: z.string().trim().min(8).max(128).optional().nullable(),
}).strict();

export const publicHoldDetailsSchema = z.object({
    guestToken: z.string().trim().min(16).max(512),
    fullName: z.string().trim().min(1).max(120),
    email: z.string().email().max(254),
    phone: z.string().trim().max(40).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    consentMarketing: z.boolean().default(false),
    intakeResponses: z.array(z.object({
        intakeFormId: uuid,
        responses: z.record(z.any()),
    })).optional(),
}).strict();

export const publicReleaseHoldSchema = z.object({
    guestToken: z.string().trim().min(16).max(512).optional(),
}).strict();

export const publicCreatePaymentIntentSchema = z.object({
    organizationId: uuid.optional(),
    bookingHoldId: uuid,
    guestToken: z.string().trim().min(16).max(512).optional().nullable(),
    idempotencyKey: z.string().trim().min(8).max(128).optional().nullable(),
}).strict();

export const publicBookingStatusQuerySchema = z.object({
    holdId: uuid,
    guestToken: z.string().trim().min(16).max(512).optional(),
}).strict();
