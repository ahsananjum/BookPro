import { z } from "zod";

export function isValidIanaTimezone(timeZone: string): boolean {
    try {
        Intl.DateTimeFormat(undefined, { timeZone });
        return true;
    } catch {
        return false;
    }
}

export const searchAvailabilitySchema = z.object({
    organizationId: z.string().uuid("Invalid organizationId"),
    locationId: z.string().uuid("Invalid locationId"),
    serviceId: z.string().uuid("Invalid serviceId"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
    staffId: z.string().uuid("Invalid staffId").optional(),
    presentationTimezone: z
        .string()
        .refine((val) => isValidIanaTimezone(val), "Invalid presentation IANA timezone")
        .optional(),

    partySize: z.number().int().min(1).default(1),
    addonIds: z.array(z.string().uuid()).max(100).optional(),
}).strict();

export const validateAvailabilitySchema = z.object({
    organizationId: z.string().uuid("Invalid organizationId"),
    locationId: z.string().uuid("Invalid locationId"),
    serviceId: z.string().uuid("Invalid serviceId"),
    staffId: z.string().uuid("Invalid staffId"),
    startTime: z.string().datetime("startTime must be valid ISO-8601 UTC string"),
    partySize: z.number().int().min(1).default(1),
    addonIds: z.array(z.string().uuid()).optional(),
    resourceIds: z.array(z.string().uuid()).max(100).optional(),
}).strict();

export type SearchAvailabilityInput = z.infer<typeof searchAvailabilitySchema>;
export type ValidateAvailabilityInput = z.infer<typeof validateAvailabilitySchema>;
