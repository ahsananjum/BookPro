import { Injectable } from "@nestjs/common";
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from "@nestjs/terminus";

@Injectable()
export class SystemHealthIndicator extends HealthIndicator {
    async checkDatabase(name: string, checkFn: () => Promise<boolean>): Promise<HealthIndicatorResult> {
        try {
            const isHealthy = await checkFn();
            const result = this.getStatus(name, isHealthy, { message: isHealthy ? "Up" : "Down" });
            if (isHealthy) {
                return result;
            }
            throw new HealthCheckError("Database check failed", result);
        } catch (err: any) {
            const result = this.getStatus(name, false, { error: err.message || "Database connection error" });
            throw new HealthCheckError("Database connection error", result);
        }
    }

    async checkRedis(name: string, checkFn: () => Promise<boolean>): Promise<HealthIndicatorResult> {
        try {
            const isHealthy = await checkFn();
            const result = this.getStatus(name, isHealthy, { message: isHealthy ? "Up" : "Down" });
            if (isHealthy) {
                return result;
            }
            throw new HealthCheckError("Redis check failed", result);
        } catch (err: any) {
            const result = this.getStatus(name, false, { error: err.message || "Redis connection error" });
            throw new HealthCheckError("Redis connection error", result);
        }
    }
}
