import { z } from "zod";

const uuid = z.string().uuid();
const isoInstant = z.string().datetime({ offset: true }).or(z.string().datetime());
const idempotencyKey = z.string().trim().min(8).max(128);

export const manualAppointmentSchema = z.object({
    locationId: uuid,
    serviceId: uuid,
    staffId: uuid.nullish(),
    customerId: uuid.nullish(),
    customerName: z.string().trim().min(1).max(120).nullish(),
    customerEmail: z.string().email().max(254).nullish(),
    customerPhone: z.string().max(40).nullish(),
    startAt: isoInstant,
    endAt: isoInstant.optional(),
    partySize: z.number().int().min(1).max(100).optional(),
    paymentStatus: z.enum(["UNPAID", "PENDING", "PARTIALLY_PAID", "PAID", "PARTIALLY_REFUNDED", "REFUNDED"]).optional(),
    internalNotes: z.string().max(2_000).nullish(),
    overrideReason: z.string().min(3).max(500).nullish(),
    idempotencyKey: idempotencyKey.nullish(),
    intakeResponses: z.array(z.object({ intakeFormId: uuid, responses: z.record(z.unknown()) }).strict()).max(50).optional(),
}).strict();

export const rescheduleAppointmentSchema = z.object({
    newStartAt: isoInstant,
    newEndAt: isoInstant,
    newStaffId: uuid.optional(),
    organizationId: uuid.optional(),
    overrideReason: z.string().trim().max(500).nullish(),
}).strict();

export const cancelAppointmentSchema = z.object({
    reason: z.string().trim().max(500).optional(),
    organizationId: uuid.optional(),
    quoteVersion: z.string().max(128).optional(),
}).strict();

export const organizationContextBodySchema = z.object({ organizationId: uuid.optional() }).strict();
export const selectCustomerOrganizationSchema = z.object({ organizationId: uuid }).strict();
export const mfaCompleteSchema = z.object({
    challengeToken: z.string().min(16).max(2_048),
    code: z.string().regex(/^(?:\d{6}|[A-Fa-f0-9-]{10,20})$/),
}).strict();

export const onboardingStepSchema = z.object({
    step: z.number().int().min(1).max(20),
    data: z.record(z.unknown()).optional(),
    completed: z.boolean().optional(),
}).strict();

export const calculatePricingQuoteSchema = z.object({
    organizationId: uuid.optional(), locationId: uuid.optional(), serviceId: uuid,
    staffId: uuid.optional(), addOnIds: z.array(uuid).max(100).optional(), couponCode: z.string().max(100).optional(),
}).strict();

export const createPaymentIntentSchema = z.object({
    organizationId: uuid.optional(), holdId: uuid.optional(), appointmentId: uuid.optional(),
    amountCents: z.number().int().positive(), currency: z.string().length(3).optional(), idempotencyKey: idempotencyKey.optional(),
}).strict().refine((value) => Boolean(value.holdId || value.appointmentId), { message: "holdId or appointmentId is required" });

export const processRefundSchema = z.object({
    organizationId: uuid.optional(), paymentRecordId: uuid, amountCents: z.number().int().positive().optional(),
    currency: z.string().optional(),
    reason: z.string().max(500).optional(), actorType: z.enum(["STAFF", "SYSTEM", "CUSTOMER"]).optional(),
    actorId: uuid.optional(), idempotencyKey: idempotencyKey.optional(),
}).strict();

export const selectCalendarSchema = z.object({ staffId: uuid, calendarId: z.string().min(1).max(512), calendarName: z.string().max(200).optional() }).strict();
export const staffIdBodySchema = z.object({ staffId: uuid }).strict();
export const createCommissionRuleSchema = z.object({
    staffId: uuid.optional(),
    name: z.string().trim().min(1).max(160).default("Default Rule"),
    calculationType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]).default("PERCENTAGE"),
    rateValue: z.number().int().min(0).max(100_000_000).default(1_000),
    calculationBasis: z.enum(["NET_SERVICE_PRICE", "GROSS_SERVICE_PRICE", "TOTAL_APPOINTMENT_PRICE"]).default("NET_SERVICE_PRICE"),
}).strict();
export const updateCommissionStatusSchema = z.object({ status: z.enum(["PENDING", "APPROVED", "PAID", "CLAWED_BACK"]) }).strict();
export const customerNoteSchema = z.object({ content: z.string().trim().min(1).max(5_000), isInternal: z.boolean().default(true) }).strict();
export const marketingConsentSchema = z.object({ consentMarketing: z.boolean(), source: z.string().max(100).optional() }).strict();
export const createCustomerSchema = z.object({
    fullName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().toLowerCase(),
    phone: z.string().trim().max(30).optional().nullable(),
    tags: z.array(z.string().trim().max(40)).default([]),
    operationalNotes: z.string().trim().max(2000).optional().nullable(),
    consentMarketing: z.boolean().default(false),
}).strict();
export const updateCustomerSchema = z.object({
    fullName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(30).optional().nullable(),
    tags: z.array(z.string().trim().max(40)).optional(),
    operationalNotes: z.string().trim().max(2000).optional().nullable(),
    consentMarketing: z.boolean().optional(),
}).strict();
export const manageCustomerTagSchema = z.object({
    tag: z.string().trim().min(1).max(40),
    action: z.enum(["add", "remove"]),
}).strict();
