import { z } from "zod";

export const uuidSchema = z.string().uuid("Invalid UUID format");

export const moneyCentsSchema = z
    .number()
    .int("Money values must be integers (cents)")
    .nonnegative("Money values cannot be negative");

export const organizationIdSchema = z.string().uuid("Invalid organizationId UUID");
