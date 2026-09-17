import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response } from "express";
import { ZodError } from "zod";
import { ApiErrorDetail, ApiProblem, ErrorCode, ErrorCodes } from "@bookpro/contracts";
import { RequestWithContext } from "./request-context.middleware";

type PublicError = { status: number; title: string; detail: string };

const PUBLIC_ERRORS: Record<ErrorCode, PublicError> = {
    INTERNAL_SERVER_ERROR: { status: 500, title: "Internal Server Error", detail: "The service could not complete this request. Please try again shortly." },
    INVALID_INPUT: { status: 400, title: "Invalid Request", detail: "The request contains invalid input." },
    INVALID_HEADER: { status: 400, title: "Invalid Header", detail: "A request header is invalid." },
    UNAUTHORIZED: { status: 401, title: "Unauthorized", detail: "Authentication is required or is no longer valid." },
    FORBIDDEN: { status: 403, title: "Forbidden", detail: "You are not allowed to perform this action." },
    NOT_FOUND: { status: 404, title: "Not Found", detail: "The requested resource was not found." },
    METHOD_NOT_ALLOWED: { status: 405, title: "Method Not Allowed", detail: "This method is not supported for the requested resource." },
    CONFLICT: { status: 409, title: "Conflict", detail: "The request conflicts with the current resource state." },
    PAYLOAD_TOO_LARGE: { status: 413, title: "Payload Too Large", detail: "The request body is too large." },
    TOO_MANY_REQUESTS: { status: 429, title: "Too Many Requests", detail: "Too many requests were received. Please retry later." },
    IDEMPOTENCY_CONFLICT: { status: 409, title: "Idempotency Conflict", detail: "The idempotency key was already used for a different request." },
    TENANT_NOT_FOUND: { status: 404, title: "Tenant Not Found", detail: "The requested organization was not found." },
    TENANT_INACTIVE: { status: 403, title: "Tenant Inactive", detail: "The requested organization is not active." },
    CROSS_TENANT_ACCESS_DENIED: { status: 403, title: "Forbidden", detail: "Cross-organization access is not allowed." },
    SLOT_UNAVAILABLE: { status: 409, title: "Slot Unavailable", detail: "The requested appointment slot is no longer available." },
    HOLD_EXPIRED: { status: 409, title: "Hold Expired", detail: "The booking hold has expired." },
    HOLD_ALREADY_CLAIMED: { status: 409, title: "Hold Already Claimed", detail: "The booking hold has already been claimed." },
    DOUBLE_BOOKING_PREVENTED: { status: 409, title: "Booking Conflict", detail: "The request would create a conflicting booking." },
    INVALID_STATE_TRANSITION: { status: 409, title: "Invalid State Transition", detail: "The resource cannot move to the requested state." },
    FEATURE_NOT_ENTITLED: { status: 403, title: "Feature Unavailable", detail: "This feature is not available for the current organization." },
    LIMIT_EXCEEDED: { status: 403, title: "Limit Exceeded", detail: "The organization has reached the applicable limit." },
    SERVICE_UNAVAILABLE: { status: 503, title: "Service Unavailable", detail: "The service is temporarily unavailable. Please try again shortly." },
    PAYMENT_ACCOUNT_NOT_READY: { status: 503, title: "Payment Gateway Not Ready", detail: "This organization is not currently able to accept online payments. No booking or charge was created." },
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const http = host.switchToHttp();
        const response = http.getResponse<Response>();
        const request = http.getRequest<RequestWithContext>();
        const requestId = request.context?.requestId || "unknown";
        const correlationId = request.context?.correlationId || requestId;
        const isHttp = exception instanceof HttpException || (typeof (exception as any)?.getStatus === "function" && typeof (exception as any)?.getResponse === "function");
        const status = isHttp ? (exception as any).getStatus()
            : exception instanceof ZodError ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR;
        const responseBody = isHttp ? (exception as any).getResponse() : undefined;
        const suppliedCode = typeof responseBody === "object" && responseBody !== null
            ? (responseBody as Record<string, unknown>).code : undefined;
        const code = this.publicCode(suppliedCode, status);
        const publicError = PUBLIC_ERRORS[code];
        const details = this.validationDetails(exception, responseBody, code);

        if (status >= 500) {
            const error = exception instanceof Error ? exception : new Error("Non-Error exception");
            this.logger.error(`Unhandled exception [requestId=${requestId}] ${error.message}`, error.stack);
        }

        const rawMessage = typeof responseBody === "string"
            ? responseBody
            : (typeof responseBody === "object" && responseBody !== null && typeof (responseBody as any).message === "string")
            ? (responseBody as any).message
            : undefined;
        const detail = (status < 500 && rawMessage) ? rawMessage : publicError.detail;

        const problem: ApiProblem = {
            type: `https://api.bookpro.local/problems/${code.toLowerCase().replace(/_/g, "-")}`,
            title: publicError.title,
            status,
            detail,
            instance: (request.originalUrl || request.url || "/").split("?", 1)[0].slice(0, 2_048),
            code,
            requestId,
            correlationId,
            timestamp: new Date().toISOString(),
            ...(details.length ? { details } : {}),
        };
        response.status(status).type("application/problem+json").json(problem);
    }

    private publicCode(value: unknown, status: number): ErrorCode {
        if (typeof value === "string" && Object.prototype.hasOwnProperty.call(PUBLIC_ERRORS, value)) {
            const code = value as ErrorCode;
            if (PUBLIC_ERRORS[code].status === status) return code;
        }
        switch (status) {
            case 400: return ErrorCodes.INVALID_INPUT;
            case 401: return ErrorCodes.UNAUTHORIZED;
            case 403: return ErrorCodes.FORBIDDEN;
            case 404: return ErrorCodes.NOT_FOUND;
            case 405: return ErrorCodes.METHOD_NOT_ALLOWED;
            case 409: return ErrorCodes.CONFLICT;
            case 413: return ErrorCodes.PAYLOAD_TOO_LARGE;
            case 429: return ErrorCodes.TOO_MANY_REQUESTS;
            case 503: return ErrorCodes.SERVICE_UNAVAILABLE;
            default: return ErrorCodes.INTERNAL_SERVER_ERROR;
        }
    }

    private validationDetails(exception: unknown, body: unknown, code: ErrorCode): ApiErrorDetail[] {
        if (exception instanceof ZodError) return exception.issues.map((issue) => ({ field: issue.path.join(".") || undefined, message: issue.message, code: issue.code }));
        if (code !== ErrorCodes.INVALID_INPUT && code !== ErrorCodes.INVALID_HEADER) return [];
        if (typeof body !== "object" || body === null) return [];
        const record = body as Record<string, unknown>;
        if (Array.isArray(record.details)) return record.details.slice(0, 50).map((value) => this.safeDetail(value));
        if (Array.isArray(record.message)) return record.message.slice(0, 50).map((message) => ({ message: String(message).slice(0, 500) }));
        return [];
    }

    private safeDetail(value: unknown): ApiErrorDetail {
        const detail = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
        return {
            ...(typeof detail.field === "string" ? { field: detail.field.slice(0, 200) } : {}),
            message: typeof detail.message === "string" ? detail.message.slice(0, 500) : "Invalid value",
            ...(typeof detail.code === "string" ? { code: detail.code.slice(0, 100) } : {}),
        };
    }
}

export { PUBLIC_ERRORS as PublicErrorCatalogue };
