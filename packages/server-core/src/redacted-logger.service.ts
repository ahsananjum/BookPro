import { Injectable, LoggerService } from "@nestjs/common";

const SENSITIVE_KEYS = [
    "password",
    "secret",
    "token",
    "authorization",
    "apikey",
    "cookie",
    "cvv",
    "creditcard",
];

@Injectable()
export class RedactedLoggerService implements LoggerService {
    log(message: any, ...optionalParams: any[]) {
        console.log(`[INFO]`, this.sanitize(message), ...optionalParams.map((p) => this.sanitize(p)));
    }

    error(message: any, ...optionalParams: any[]) {
        console.error(`[ERROR]`, this.sanitize(message), ...optionalParams.map((p) => this.sanitize(p)));
    }

    warn(message: any, ...optionalParams: any[]) {
        console.warn(`[WARN]`, this.sanitize(message), ...optionalParams.map((p) => this.sanitize(p)));
    }

    debug?(message: any, ...optionalParams: any[]) {
        console.debug(`[DEBUG]`, this.sanitize(message), ...optionalParams.map((p) => this.sanitize(p)));
    }

    private sanitize(obj: any): any {
        if (typeof obj === "string") {
            return obj;
        }
        if (typeof obj !== "object" || obj === null) {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map((item) => this.sanitize(item));
        }

        const sanitized: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (SENSITIVE_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive))) {
                sanitized[key] = "[REDACTED]";
            } else {
                sanitized[key] = this.sanitize(value);
            }
        }
        return sanitized;
    }
}
