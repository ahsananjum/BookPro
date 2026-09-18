import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication, ExpressAdapter } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { BoundaryValidationPipe, GlobalExceptionFilter, RedactedLoggerService } from "@bookpro/server-core";
import { loadConfig } from "@bookpro/config";
import express, { Express, Request, Response } from "express";

let cachedServer: Express | null = null;
let cachedApp: NestExpressApplication | null = null;

async function bootstrapServer(): Promise<Express> {
    if (cachedServer) {
        return cachedServer;
    }

    const expressApp: Express = express();
    const app = await NestFactory.create<NestExpressApplication>(
        AppModule,
        new ExpressAdapter(expressApp),
        {
            rawBody: true,
            logger: new RedactedLoggerService(),
        }
    );

    const config = loadConfig();
    app.set("trust proxy", config.TRUST_PROXY_HOPS === 0 ? false : config.TRUST_PROXY_HOPS);
    app.useBodyParser("json", { limit: "256kb" });
    app.useBodyParser("urlencoded", { limit: "64kb", extended: false });

    app.use((_req: any, res: any, next: any) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        res.setHeader("X-Frame-Options", "DENY");
        next();
    });

    const allowedOrigins = config.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim());
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
                callback(null, true);
            } else {
                callback(new Error("CORS policy violation"), false);
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "x-request-id",
            "x-correlation-id",
            "x-organization-id",
            "x-tenant-slug",
            "x-guest-token",
            "x-idempotency-key",
            "cookie",
        ],
    });

    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new BoundaryValidationPipe());
    app.useGlobalFilters(new GlobalExceptionFilter());

    await app.init();

    cachedApp = app;
    cachedServer = expressApp;
    return cachedServer;
}

export default async function handler(req: Request, res: Response) {
    const server = await bootstrapServer();
    return server(req, res);
}
