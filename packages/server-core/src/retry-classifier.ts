/**
 * BookPro Retry and Error Classifier
 * Source Specification: ARCHITECTURE.md §117 & PRD §92
 */

export interface ErrorClassification {
    isRetryable: boolean;
    category: "TIMEOUT" | "RATE_LIMITED" | "TRANSIENT_SERVER_ERROR" | "TRANSIENT_DB" | "TERMINAL_CLIENT_ERROR" | "TERMINAL_AUTH" | "TERMINAL_BUSINESS_CONFLICT" | "UNKNOWN";
    reason: string;
}

export class RetryClassifier {
    static classify(error: any): ErrorClassification {
        if (!error) {
            return {
                isRetryable: false,
                category: "UNKNOWN",
                reason: "Null or undefined error",
            };
        }

        const message = (error.message || String(error)).toLowerCase();
        const status = error.status || error.statusCode || error.response?.status;
        const code = error.code || error.error?.code;

        // 1. Rate Limiting (429) -> Retryable
        if (status === 429 || message.includes("rate limit") || message.includes("too many requests")) {
            return {
                isRetryable: true,
                category: "RATE_LIMITED",
                reason: "Rate limited by upstream provider (HTTP 429)",
            };
        }

        // 2. Timeouts & Network Transient -> Retryable
        if (
            code === "ETIMEDOUT" ||
            code === "ECONNRESET" ||
            code === "ECONNREFUSED" ||
            code === "ENOTFOUND" ||
            message.includes("timeout") ||
            message.includes("network error") ||
            message.includes("socket hang up")
        ) {
            return {
                isRetryable: true,
                category: "TIMEOUT",
                reason: `Network/Timeout error: ${code || message}`,
            };
        }

        // 3. Upstream 5xx Transient -> Retryable
        if (status >= 500 && status <= 599) {
            return {
                isRetryable: true,
                category: "TRANSIENT_SERVER_ERROR",
                reason: `Transient server error (HTTP ${status})`,
            };
        }

        // 4. DB Transient (Serialization failure, Deadlock, Connection limit) -> Retryable
        if (
            code === "40001" || // PostgreSQL serialization_failure
            code === "40P01" || // PostgreSQL deadlock_detected
            message.includes("deadlock") ||
            message.includes("serialization failure") ||
            message.includes("connection pool timeout")
        ) {
            return {
                isRetryable: true,
                category: "TRANSIENT_DB",
                reason: `Transient database lock/concurrency failure: ${code || message}`,
            };
        }

        // 5. Terminal: Invalid Recipient / Malformed Address
        if (
            message.includes("invalid email") ||
            message.includes("invalid recipient") ||
            message.includes("unsubscribed") ||
            message.includes("mailbox not found") ||
            message.includes("invalid phone")
        ) {
            return {
                isRetryable: false,
                category: "TERMINAL_CLIENT_ERROR",
                reason: "Terminal recipient error (invalid or unsubscribed address)",
            };
        }

        // 6. Terminal: Authentication / Unauthorized Integration
        if (status === 401 || status === 403 || message.includes("invalid api key") || message.includes("token revoked")) {
            return {
                isRetryable: false,
                category: "TERMINAL_AUTH",
                reason: "Terminal auth error (invalid credentials or revoked token)",
            };
        }

        // 7. Terminal: Business Conflict / Entity not found
        if (status === 404 || status === 409 || message.includes("not found") || message.includes("conflict")) {
            return {
                isRetryable: false,
                category: "TERMINAL_BUSINESS_CONFLICT",
                reason: `Terminal business conflict: ${message}`,
            };
        }

        // Default: Non-retryable if 4xx, otherwise single retry attempt
        if (status >= 400 && status < 500) {
            return {
                isRetryable: false,
                category: "TERMINAL_CLIENT_ERROR",
                reason: `Client error HTTP ${status}`,
            };
        }

        return {
            isRetryable: false,
            category: "UNKNOWN",
            reason: message,
        };
    }
}
