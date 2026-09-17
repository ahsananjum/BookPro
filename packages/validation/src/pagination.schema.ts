import { z } from "zod";

export const paginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().max(200).optional(),
    sortBy: z.string().max(100).optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).strict();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
