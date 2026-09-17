import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { RequestContext, RequestHeaders, ActorType } from "@bookpro/contracts";

export interface RequestWithContext extends Request {
    context?: RequestContext;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
    use(req: RequestWithContext, res: Response, next: NextFunction) {
        const incomingRequestId = this.validTraceId(req.header(RequestHeaders.REQUEST_ID));
        const incomingCorrelationId = this.validTraceId(req.header(RequestHeaders.CORRELATION_ID));

        const requestId =
            incomingRequestId
                ? incomingRequestId
                : uuidv4();
        const correlationId =
            incomingCorrelationId
                ? incomingCorrelationId
                : requestId;

        // Secure Baseline: Default unauthenticated SYSTEM actor. Authentication Guard populates authenticated tenant & permissions.
        const context: RequestContext = {
            requestId,
            correlationId,
            actorType: ActorType.SYSTEM,
            subjectId: "anonymous",
            permissions: [],
            locale: this.boundedHeader(req.header("accept-language"), 128) || "en-US",
            timezone: this.boundedHeader(req.header("x-timezone"), 100) || "UTC",
            isPlatformAdmin: false,
            // Express derives req.ip from the explicitly configured trust-proxy policy.
            // Never consume x-forwarded-for directly.
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: this.boundedHeader(req.header("user-agent"), 512),
            issuedAt: new Date().toISOString(),
        };

        req.context = context;

        res.setHeader(RequestHeaders.REQUEST_ID, requestId);
        res.setHeader(RequestHeaders.CORRELATION_ID, correlationId);

        next();
    }

    private validTraceId(value?: string): string | undefined {
        const normalized = value?.trim();
        return normalized && normalized.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)
            ? normalized
            : undefined;
    }

    private boundedHeader(value: string | undefined, maxLength: number): string | undefined {
        return value && value.length <= maxLength ? value : undefined;
    }
}
