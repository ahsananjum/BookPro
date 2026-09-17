import { Controller, Get, Res, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
    constructor(private readonly healthService: HealthService) { }

    @Get()
    async check(@Res() res: Response) {
        const health = await this.healthService.getReadinessHealth();
        const statusCode = health.status === "unhealthy" ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK;
        return res.status(statusCode).json(health);
    }

    @Get("readiness")
    async readiness(@Res() res: Response) {
        const health = await this.healthService.getReadinessHealth();
        const statusCode = health.status === "unhealthy" ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK;
        return res.status(statusCode).json(health);
    }

    @Get("liveness")
    liveness() {
        return {
            status: "ok",
            role: "worker",
            workerId: this.healthService.getWorkerId(),
            timestamp: new Date().toISOString(),
        };
    }
}
