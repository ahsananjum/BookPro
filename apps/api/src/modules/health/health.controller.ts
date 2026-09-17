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
        return { status: "ready", services: { db: true, redis: true } };
    }

    @Get("test-error")
    testError() {
        throw new HttpException("Simulated baseline error for error envelope validation", HttpStatus.BAD_REQUEST);
    }
}
