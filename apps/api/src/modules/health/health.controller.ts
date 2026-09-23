import { Controller, Get, HttpException, HttpStatus } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { SystemHealthIndicator } from "@bookpro/observability";
import { Public } from "@bookpro/server-core";

@Controller("health")
@Public()
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private systemHealth: SystemHealthIndicator
    ) { }

    @Get()
    @HealthCheck()
    check() {
        return this.health.check([
            () => this.systemHealth.checkDatabase("database", async () => true),
            () => this.systemHealth.checkRedis("redis", async () => true),
        ]);
    }

    @Get("liveness")
    liveness() {
        return { status: "ok", timestamp: new Date().toISOString() };
    }

    @Get("readiness")
    readiness() {
        const hasBrevoKey = !!process.env.BREVO_API_KEY;
        return {
            status: "ready",
            services: {
                db: true,
                redis: true,
                email: {
                    provider: "brevo",
                    configured: hasBrevoKey,
                    sender: process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || "ahsananjum170@gmail.com",
                },
            },
        };
    }

    @Get("test-error")
    testError() {
        throw new HttpException("Simulated baseline error for error envelope validation", HttpStatus.BAD_REQUEST);
    }
}
