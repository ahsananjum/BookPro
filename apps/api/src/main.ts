import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { BoundaryValidationPipe, GlobalExceptionFilter, RedactedLoggerService } from "@bookpro/server-core";
import { loadConfig } from "@bookpro/config";

async function bootstrap() {
    const config = loadConfig();
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        rawBody: true,
        logger: new RedactedLoggerService(),
    });
    app.set("trust proxy", config.TRUST_PROXY_HOPS === 0 ? false : config.TRUST_PROXY_HOPS);
    app.useBodyParser("json", { limit: "256kb" });
    app.useBodyParser("urlencoded", { limit: "64kb", extended: false });
    app.use((_req: any, res: any, next: any) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        res.setHeader("X-Frame-Options", "DENY");
        next();
    });


    // Safe CORS baseline with dev reflection support
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

    const openApiConfig = new DocumentBuilder()
        .setTitle("BookPro API")
        .setDescription("Executable HTTP contract for BookPro consumers")
        .setVersion("1.0")
        .addBearerAuth()
        .addApiKey({ type: "apiKey", in: "header", name: "x-request-id", description: "Optional client trace ID (1-128 safe characters)" }, "requestId")
        .build();
    const openApiDocument = SwaggerModule.createDocument(app, openApiConfig, {
        operationIdFactory: (controller: string, method: string) => `${controller.replace(/Controller$/, "")}_${method}`,
    });
    openApiDocument.components = openApiDocument.components || {};
    openApiDocument.components.schemas = {
        ...openApiDocument.components.schemas,
        ApiProblem: {
            type: "object",
            required: ["type", "title", "status", "detail", "instance", "code", "requestId", "correlationId", "timestamp"],
            additionalProperties: false,
            properties: {
                type: { type: "string", format: "uri" }, title: { type: "string" }, status: { type: "integer" },
                detail: { type: "string" }, instance: { type: "string" }, code: { type: "string" },
                requestId: { type: "string", maxLength: 128 }, correlationId: { type: "string", maxLength: 128 },
                timestamp: { type: "string", format: "date-time" },
                details: { type: "array", maxItems: 50, items: { type: "object", additionalProperties: false, required: ["message"], properties: { field: { type: "string" }, message: { type: "string" }, code: { type: "string" } } } },
            },
        },
    };
    const problemResponse = {
        description: "Normalized public problem response",
        content: { "application/problem+json": { schema: { $ref: "#/components/schemas/ApiProblem" } } },
    };
    for (const pathItem of Object.values(openApiDocument.paths)) {
        if (!pathItem) continue;
        for (const operation of Object.values(pathItem)) {
            if (typeof operation !== "object" || operation === null || !("responses" in operation)) continue;
            const responses = operation.responses as Record<string, unknown>;
            responses["400"] ||= problemResponse;
            responses["401"] ||= problemResponse;
            responses["403"] ||= problemResponse;
            responses["413"] ||= problemResponse;
            responses["429"] ||= problemResponse;
            responses["500"] ||= problemResponse;
        }
    }
    SwaggerModule.setup("api/docs", app, openApiDocument, {
        jsonDocumentUrl: "/api/openapi.json",
        customSiteTitle: "BookPro API Contract",
    });

    const port = config.PORT || 4000;
    await app.listen(port, "0.0.0.0");
    console.log(`[BookPro API] Server running on http://127.0.0.1:${port}/api/v1`);
}

bootstrap();
