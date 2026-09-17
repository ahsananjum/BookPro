import { z } from "zod";

export const createCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters")
    .max(32, "Code cannot exceed 32 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Code must contain only letters, numbers, hyphens, and underscores")
    .transform((v) => v.toUpperCase()),
  discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
  discountValue: z.coerce.number().int().positive("Discount value must be a positive integer"),
  minSpendCents: z.coerce.number().int().min(0).optional().nullable(),
  maxDiscountCents: z.coerce.number().int().min(0).optional().nullable(),
  validFrom: z.string().datetime({ offset: true }).optional().nullable().or(z.string().datetime().optional().nullable()),
  validTo: z.string().datetime({ offset: true }).optional().nullable().or(z.string().datetime().optional().nullable()),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional().default(true),
}).strict();

export const updateCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .transform((v) => v.toUpperCase())
    .optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]).optional(),
  discountValue: z.coerce.number().int().positive().optional(),
  minSpendCents: z.coerce.number().int().min(0).optional().nullable(),
  maxDiscountCents: z.coerce.number().int().min(0).optional().nullable(),
  validFrom: z.string().datetime({ offset: true }).optional().nullable().or(z.string().datetime().optional().nullable()),
  validTo: z.string().datetime({ offset: true }).optional().nullable().or(z.string().datetime().optional().nullable()),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
}).strict();

export const sendCampaignExtendedSchema = z.object({
  templateId: z.string().uuid("Invalid template ID"),
  name: z.string().trim().min(2, "Campaign name must be at least 2 characters").max(120),
  segment: z
    .enum(["ALL_SUBSCRIBED", "PORTAL_MEMBERS", "VIP_CLIENTS", "INACTIVE_CLIENTS", "RECENT_CLIENTS"])
    .optional()
    .default("ALL_SUBSCRIBED"),
  couponId: z.string().uuid("Invalid coupon ID").optional().nullable(),
}).strict();

export const customerMarketingPreferenceSchema = z.object({
  consentMarketing: z.boolean(),
}).strict();

export const audienceQuerySchema = z.object({
  segment: z
    .enum(["ALL_SUBSCRIBED", "PORTAL_MEMBERS", "VIP_CLIENTS", "INACTIVE_CLIENTS", "RECENT_CLIENTS"])
    .optional(),
  search: z.string().trim().optional(),
  status: z.enum(["all", "subscribed", "unsubscribed"]).optional().default("all"),
}).strict();
