import { z } from "zod";

export const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(4000),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    WORKER_PORT: z.coerce.number().default(4001),
    WEB_PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DIRECT_URL: z.string().optional(),
    REDIS_URL: z.string().min(1, "REDIS_URL is required"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    JWT_EXPIRES_IN: z.string().default("7d"),
    SESSION_EXPIRES_IN: z.string().default("30d"),
    COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 characters"),
    ENCRYPTION_KEY: z.string().min(32).optional(),
    OAUTH_STATE_SECRET: z.string().min(32).optional(),
    QR_SIGNING_SECRET: z.string().min(32).optional(),
    CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
    LOG_FORMAT: z.enum(["json", "text"]).default("json"),
    GEMINI_API_KEY: z.string().min(1).optional(),
    AI_PROPOSAL_SECRET: z.string().min(32).optional(),
    GEMINI_MODEL: z.string().regex(/^gemini-[a-z0-9.-]+$/).default("gemini-3.7-flash"),
    AI_ENABLED: z.coerce.boolean().default(false),
    AI_VOICE_ENABLED: z.coerce.boolean().default(false),
    AI_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    AI_MAX_MESSAGE_CHARS: z.coerce.number().int().min(100).max(20000).default(4000),
    AI_MAX_TOOL_DEPTH: z.coerce.number().int().min(1).max(8).default(4),
    AI_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(20),
    AI_MONTHLY_MESSAGE_LIMIT: z.coerce.number().int().min(1).default(1000),
    AI_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
    BREVO_API_KEY: z.string().min(1).optional(),
    BREVO_SENDER_EMAIL: z.string().min(3).optional(),
    EMAIL_FROM: z.string().min(3).optional(),
    WEB_URL: z.string().url().default("http://localhost:3000"),
    STRIPE_MODE: z.enum(["disabled", "test", "live"]).default("disabled"),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_CLIENT_ID: z.string().optional(),
    STRIPE_ACCOUNT_ID: z.string().optional(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
        for (const name of ["ENCRYPTION_KEY", "OAUTH_STATE_SECRET", "QR_SIGNING_SECRET"] as const) {
            if (!data[name]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: `${name} is required in production` });
        }
        const secrets = [data.JWT_SECRET, data.COOKIE_SECRET, data.ENCRYPTION_KEY, data.OAUTH_STATE_SECRET, data.QR_SIGNING_SECRET].filter(Boolean);
        if (new Set(secrets).size !== secrets.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["JWT_SECRET"], message: "Security secrets must be independent values" });
    }
    if (data.STRIPE_MODE === "test") {
        if (!data.STRIPE_SECRET_KEY || (!data.STRIPE_SECRET_KEY.startsWith("sk_test_") && !data.STRIPE_SECRET_KEY.startsWith("rk_test_"))) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["STRIPE_SECRET_KEY"],
                message: "STRIPE_SECRET_KEY is required and must start with 'sk_test_' or 'rk_test_' when STRIPE_MODE is 'test'",
            });
        }
        if (!data.STRIPE_WEBHOOK_SECRET || !data.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["STRIPE_WEBHOOK_SECRET"],
                message: "STRIPE_WEBHOOK_SECRET is required and must start with 'whsec_' when STRIPE_MODE is 'test'",
            });
        }
    } else if (data.STRIPE_MODE === "live") {
        if (!data.STRIPE_SECRET_KEY || (!data.STRIPE_SECRET_KEY.startsWith("sk_live_") && !data.STRIPE_SECRET_KEY.startsWith("rk_live_"))) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["STRIPE_SECRET_KEY"],
                message: "STRIPE_SECRET_KEY is required and must start with 'sk_live_' or 'rk_live_' when STRIPE_MODE is 'live'",
            });
        }
        if (!data.STRIPE_WEBHOOK_SECRET || !data.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["STRIPE_WEBHOOK_SECRET"],
                message: "STRIPE_WEBHOOK_SECRET is required and must start with 'whsec_' when STRIPE_MODE is 'live'",
            });
        }
    }
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, unknown> | Record<string, any>): EnvConfig {
    const result = envSchema.safeParse(env);
    if (!result.success) {
        const formatted = result.error.format();
        throw new Error(`[EnvValidationError] Invalid environment variables:\n${JSON.stringify(formatted, null, 2)}`);
    }
    return result.data;
}
