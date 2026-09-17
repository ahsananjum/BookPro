import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const waitlistBase = z.object({
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
    serviceId: uuid,
    locationId: uuid.nullish(),
    staffId: uuid.nullish(),
    allowFallbackStaff: z.boolean().optional(),
    startWindowDate: isoDate,
    endWindowDate: isoDate,
    timePreference: z.enum(["ANY", "MORNING", "AFTERNOON", "EVENING"]).optional(),
    customStartTimeMin: z.number().int().min(0).max(1_439).nullish(),
    customEndTimeMin: z.number().int().min(0).max(1_439).nullish(),
    partySize: z.number().int().min(1).max(100).optional(),
    notes: z.string().max(1_000).nullish(),
    notificationChannels: z.array(z.enum(["EMAIL", "SMS", "PUSH"])).max(3).optional(),
    guestName: z.string().trim().min(1).max(120).optional(),
    guestEmail: z.string().email().max(254).optional(),
    guestPhone: z.string().max(40).optional(),
}).strict();

export const publicJoinWaitlistSchema = waitlistBase;
export const staffJoinWaitlistSchema = waitlistBase.extend({ customerId: uuid.optional() }).strict();
export const updateWaitlistEntrySchema = waitlistBase
    .omit({ idempotencyKey: true, guestName: true, guestEmail: true, guestPhone: true })
    .partial()
    .strict();
export const createManualOfferSchema = z.object({
    waitlistEntryId: uuid,
    startAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
    endAt: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
    staffId: uuid.nullish(),
    locationId: uuid.nullish(),
    expiresInMinutes: z.number().int().min(5).max(1_440).optional(),
}).strict();
export const acceptOfferSchema = z.object({
    token: z.string().min(32).max(512),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
}).strict();

export const declineOfferSchema = z.object({
    token: z.string().min(32).max(512),
    reason: z.string().max(500).optional(),
    removeFromWaitlist: z.boolean().optional(),
}).strict();

export const smartRescheduleWaitlistSchema = z.object({
    appointmentId: uuid,
    preferredDateRange: z.object({
        start: isoDate,
        end: isoDate,
    }),
    timePreference: z.enum(["ANY", "MORNING", "AFTERNOON", "EVENING"]).optional(),
    staffId: uuid.nullish(),
    notes: z.string().max(1_000).optional(),
}).strict();
