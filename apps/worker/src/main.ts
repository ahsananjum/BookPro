import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";
import { RedactedLoggerService } from "@bookpro/server-core";
import { loadConfig } from "@bookpro/config";

async function bootstrap() {
    const config = loadConfig();
    const app = await NestFactory.create(WorkerModule, {
        logger: new RedactedLoggerService(),
    });

    const port = config.WORKER_PORT || 4001;
    app.enableShutdownHooks();
    await app.listen(port);
    console.log(`[BookPro Worker] Process initialized & listening on health port http://localhost:${port}`);
}

bootstrap();
