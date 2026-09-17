import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "@bookpro/server-core";
import { WorkerHealthDto, OutboxLagMetrics, ProviderHealthStatus } from "@bookpro/contracts";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import * as os from "os";

@Injectable()
export class HealthService {
    private readonly logger = new Logger(HealthService.name);
    private readonly workerId = process.env.WORKER_ID || `worker-${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
    private readonly startTime = Date.now();

    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) { }

    getWorkerId(): string {
        return this.workerId;
    }

    /**
     * Executes bounded readiness checks against Database, Redis, Outbox lag metrics, and provider configurations
     */
    async getReadinessHealth(): Promise<WorkerHealthDto> {
        const timestamp = new Date().toISOString();
        const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);

        // 1. Database Health Check
        let dbStatus: "UP" | "DOWN" = "DOWN";
        let dbLatencyMs = 0;
        let dbError: string | undefined;

        try {
            const startDb = Date.now();
            await this.prisma.$queryRaw(Prisma.sql`SELECT 1;`);
            dbLatencyMs = Date.now() - startDb;
            dbStatus = "UP";
        } catch (err: any) {
            dbStatus = "DOWN";
            dbError = err.message;
            this.logger.error(`[HealthCheck] Database readiness failure: ${err.message}`);
        }

        // 2. Redis Health Check
        let redisStatus: "UP" | "DOWN" = "DOWN";
        let redisLatencyMs = 0;
        let redisError: string | undefined;

        try {
            const startRedis = Date.now();
            const isPong = await this.redisService.ping();
            redisLatencyMs = Date.now() - startRedis;
            redisStatus = isPong ? "UP" : "DOWN";
            if (!isPong) redisError = "Redis ping returned non-PONG response";
        } catch (err: any) {
            redisStatus = "DOWN";
            redisError = err.message;
            this.logger.error(`[HealthCheck] Redis readiness failure: ${err.message}`);
        }

        // 3. Outbox Queue Lag & Stale Lease Metrics
        let outboxLag: OutboxLagMetrics = {
            pendingCount: 0,
            oldestPendingAgeSeconds: 0,
            activeLeasesCount: 0,
            staleLeasesCount: 0,
            deadLetterCount: 0,
        };

        if (dbStatus === "UP") {
            try {
                const [pendingCount, oldestPendingResult, activeLeasesCount, staleLeasesCount, deadLetterCount] = await Promise.all([
                    this.prisma.outboxEvent.count({
                        where: {
                            status: "PENDING",
                            availableAt: { lte: new Date() },
                        },
                    }),
                    this.prisma.$queryRaw<any[]>(Prisma.sql`
                        SELECT EXTRACT(EPOCH FROM (NOW() - MIN("createdAt")))::int AS age_seconds
                        FROM outbox_events
                        WHERE status = 'PENDING' AND "availableAt" <= NOW();
                    `),
                    this.prisma.outboxEvent.count({
                        where: {
                            status: "PROCESSING",
                            leaseExpiresAt: { gt: new Date() },
                        },
                    }),
                    this.prisma.outboxEvent.count({
                        where: {
                            status: "PROCESSING",
                            leaseExpiresAt: { lte: new Date() },
                        },
                    }),
                    this.prisma.outboxEvent.count({
                        where: {
                            status: { in: ["DEAD_LETTER", "FAILED"] },
                        },
                    }),
                ]);

                outboxLag = {
                    pendingCount,
                    oldestPendingAgeSeconds: oldestPendingResult?.[0]?.age_seconds || 0,
                    activeLeasesCount,
                    staleLeasesCount,
                    deadLetterCount,
                };
            } catch (lagErr: any) {
                this.logger.warn(`[HealthCheck] Could not compute outbox lag metrics: ${lagErr.message}`);
            }
        }

        // 4. Provider Configuration Readiness
        const emailProviderEnv = (process.env.EMAIL_PROVIDER || "brevo").toLowerCase();
        const smsProviderEnv = (process.env.SMS_PROVIDER || "disabled").toLowerCase();

        let emailStatus: ProviderHealthStatus;
        if (emailProviderEnv === "disabled") {
            emailStatus = { provider: "disabled", configured: true, mode: "disabled" };
        } else {
            const hasBrevoKey = !!process.env.BREVO_API_KEY;
            const hasSender = !!(process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM);
            const isConfigured = hasBrevoKey && hasSender;
            emailStatus = {
                provider: "brevo",
                configured: isConfigured,
                mode: "real",
                error: isConfigured ? undefined : "Missing BREVO_API_KEY or BREVO_SENDER_EMAIL",
            };
        }

        let smsStatus: ProviderHealthStatus;
        if (smsProviderEnv === "disabled") {
            smsStatus = { provider: "disabled", configured: true, mode: "disabled" };
        } else {
            const hasSid = !!process.env.TWILIO_ACCOUNT_SID;
            const hasAuth = !!process.env.TWILIO_AUTH_TOKEN;
            const hasPhone = !!(process.env.TWILIO_PHONE_NUMBER || process.env.SMS_FROM_NUMBER);
            const isConfigured = hasSid && hasAuth && hasPhone;
            smsStatus = {
                provider: "twilio",
                configured: isConfigured,
                mode: "real",
                error: isConfigured ? undefined : "Missing Twilio credentials",
            };
        }

        // Overall Health Status Calculation
        let status: "healthy" | "degraded" | "unhealthy" = "healthy";
        if (dbStatus === "DOWN" || redisStatus === "DOWN") {
            status = "unhealthy";
        } else if (
            outboxLag.staleLeasesCount > 0 ||
            outboxLag.pendingCount > 100 ||
            (emailStatus.mode === "real" && !emailStatus.configured) ||
            (smsStatus.mode === "real" && !smsStatus.configured)
        ) {
            status = "degraded";
        }

        return {
            status,
            role: "worker",
            workerId: this.workerId,
            uptimeSeconds,
            timestamp,
            database: {
                status: dbStatus,
                latencyMs: dbLatencyMs,
                error: dbError,
            },
            redis: {
                status: redisStatus,
                latencyMs: redisLatencyMs,
                error: redisError,
            },
            outboxLag,
            providers: {
                email: emailStatus,
                sms: smsStatus,
            },
        };
    }
}
