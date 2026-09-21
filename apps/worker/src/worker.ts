import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";
import { HealthService } from "./health/health.service";
import { RedactedLoggerService } from "@bookpro/server-core";
import { loadConfig } from "@bookpro/config";

async function bootstrap() {
    const config = loadConfig();
    const app = await NestFactory.create(WorkerModule, {
        logger: new RedactedLoggerService(),
    });

    const healthService = app.get(HealthService);
    const httpAdapter: any = app.getHttpAdapter().getInstance();

    if (httpAdapter && typeof httpAdapter.get === "function") {
        httpAdapter.get("/health", async (_req: any, res: any) => {
            const health = await healthService.getReadinessHealth();
            const statusCode = health.status === "unhealthy" ? 503 : 200;
            return res.status(statusCode).json(health);
        });

        httpAdapter.get("/health/readiness", async (_req: any, res: any) => {
            const health = await healthService.getReadinessHealth();
            const statusCode = health.status === "unhealthy" ? 503 : 200;
            return res.status(statusCode).json(health);
        });

        httpAdapter.get("/health/liveness", (_req: any, res: any) => {
            return res.status(200).json({
                status: "ok",
                role: "worker",
                workerId: healthService.getWorkerId(),
                timestamp: new Date().toISOString(),
            });
        });
    }

    const port = config.WORKER_PORT || 4001;
    app.enableShutdownHooks();
    await app.listen(port);
    console.log(`[BookPro Worker] Process initialized & listening on health port http://localhost:${port}`);
}

bootstrap();
