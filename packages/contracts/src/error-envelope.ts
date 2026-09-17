export interface ApiErrorDetail {
    field?: string;
    message: string;
    code?: string;
}

export interface ApiErrorBody {
    code: string;
    message: string;
    requestId: string;
    correlationId: string;
    timestamp: string;
    details?: ApiErrorDetail[];
}

/** RFC 9457-compatible public error response with stable BookPro extensions. */
export interface ApiProblem {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance: string;
    code: ErrorCode;
    requestId: string;
    correlationId: string;
    timestamp: string;
    details?: ApiErrorDetail[];
}


export interface ApiResponseEnvelope<T = unknown> {
    success: boolean;
    data?: T;
    error?: ApiErrorBody;
}

export const ErrorCodes = {
    // Common / Infrastructure
    INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
    INVALID_INPUT: "INVALID_INPUT",
    UNAUTHORIZED: "UNAUTHORIZED",
    FORBIDDEN: "FORBIDDEN",
    NOT_FOUND: "NOT_FOUND",
    METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
    CONFLICT: "CONFLICT",
    TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
    PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
    INVALID_HEADER: "INVALID_HEADER",
    IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",

    // Tenant / Scope
    TENANT_NOT_FOUND: "TENANT_NOT_FOUND",
    TENANT_INACTIVE: "TENANT_INACTIVE",
    CROSS_TENANT_ACCESS_DENIED: "CROSS_TENANT_ACCESS_DENIED",

    // Booking / Concurrency
    SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
    HOLD_EXPIRED: "HOLD_EXPIRED",
    HOLD_ALREADY_CLAIMED: "HOLD_ALREADY_CLAIMED",
    DOUBLE_BOOKING_PREVENTED: "DOUBLE_BOOKING_PREVENTED",
    INVALID_STATE_TRANSITION: "INVALID_STATE_TRANSITION",

    // Entitlements
    FEATURE_NOT_ENTITLED: "FEATURE_NOT_ENTITLED",
    LIMIT_EXCEEDED: "LIMIT_EXCEEDED",

    // Gateway / Provider
    SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
    PAYMENT_ACCOUNT_NOT_READY: "PAYMENT_ACCOUNT_NOT_READY",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
