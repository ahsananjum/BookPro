import { z } from "zod";

export const analyticsQuerySchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD").optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD").optional(),
    locationId: z.string().uuid().optional(),
    staffId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    currency: z.string().min(3).max(3).optional(),
}).strict();

export const analyticsRebuildSchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    metricFamily: z.enum(["ALL", "ORG", "LOCATION", "STAFF", "SERVICE", "WAITLIST"]).default("ALL"),
}).strict();

export const createProductAnalyticsEventSchema = z.object({
    eventType: z.string().min(1).max(100),
    sessionId: z.string().max(100).optional(),
    metadata: z.record(z.unknown()).optional(),
}).strict();

export const createReviewSchema = z.object({
    appointmentId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).optional(),
}).strict();

export const updateReviewSchema = z.object({
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().max(2000).optional(),
    status: z.enum(["PUBLISHED", "PENDING_MODERATION", "HIDDEN"]).optional(),
}).strict();

export const reviewListQuerySchema = z.object({
    status: z.enum(["PUBLISHED", "PENDING_MODERATION", "HIDDEN"]).optional(),
    serviceId: z.string().uuid().optional(),
    staffId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
}).strict();

export const verifyQrCheckInSchema = z.object({
    token: z.string().min(10).max(512),
}).strict();

export const staffCheckInSchema = z.object({
    locationId: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
}).strict();

export const staffCheckOutSchema = z.object({
    notes: z.string().max(500).optional(),
}).strict();

export const managerCorrectAttendanceSchema = z.object({
    checkInAt: z.string().datetime().optional(),
    checkOutAt: z.string().datetime().optional(),
    status: z.enum(["ON_TIME", "LATE", "EARLY_DEPARTURE", "CORRECTED"]).optional(),
    managerNotes: z.string().min(3).max(1000),
}).strict();

export const attendanceQuerySchema = z.object({
    staffId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

export const createExportSchema = z.object({
    exportType: z.enum(["CUSTOMERS", "APPOINTMENTS", "PAYMENTS", "REVENUE_REPORT"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    locationId: z.string().uuid().optional(),
}).strict();

export const platformSupportAccessSchema = z.object({
    reason: z.string().min(5).max(500),
    targetTenantId: z.string().uuid(),
}).strict();

export const auditLogQuerySchema = z.object({
    actorType: z.string().optional(),
    action: z.string().optional(),
    resourceType: z.string().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
}).strict();
