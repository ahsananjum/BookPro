import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const scanGapsSchema = z.object({
    locationId: uuid.optional(),
    staffId: uuid.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    forceRecompute: z.boolean().default(false),
}).strict();

export const actionInsightSchema = z.object({
    selectedEntryId: uuid.optional(),
    expiresInMinutes: z.number().int().min(5).max(1440).optional(),
}).strict();

export const dismissInsightSchema = z.object({
    reason: z.string().trim().max(500).optional(),
}).strict();

export const updateOptimizerSettingsSchema = z.object({
    autoOfferEnabled: z.boolean().optional(),
    noShowSignalEnabled: z.boolean().optional(),
    optimizerMinGapMin: z.number().int().min(10).max(480).optional(),
}).strict();
