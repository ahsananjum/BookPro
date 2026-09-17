import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { ZodError, ZodType } from "zod";
import { ErrorCodes } from "@bookpro/contracts";

export const BoundaryLimits = {
    maxBodyBytes: 256 * 1024,
    maxStringLength: 20_000,
    maxQueryStringLength: 2_048,
    maxObjectKeys: 100,
    maxArrayLength: 500,
    maxDepth: 10,
} as const;

type BoundaryKind = ArgumentMetadata["type"];

/**
 * A baseline runtime schema for every Nest boundary. Endpoint Zod schemas still
 * define the permitted fields; this pipe guarantees bounded input even on routes
 * that do not yet need a domain-specific object shape.
 */
@Injectable()
export class BoundaryValidationPipe implements PipeTransform {
    transform(value: unknown, metadata: ArgumentMetadata): unknown {
        if (metadata.type === "custom" || value === undefined || value === null) return value;
        this.assertBounded(value, metadata.type, 0, metadata.data || metadata.type);
        return value;
    }

    private assertBounded(value: unknown, kind: BoundaryKind, depth: number, path: string): void {
        if (depth > BoundaryLimits.maxDepth) this.invalid(path, "Input nesting is too deep", "MAX_DEPTH");

        if (typeof value === "string") {
            const limit = kind === "query" || kind === "param"
                ? BoundaryLimits.maxQueryStringLength
                : BoundaryLimits.maxStringLength;
            if (value.length > limit) this.invalid(path, `Value exceeds ${limit} characters`, "MAX_LENGTH");
            return;
        }

        if (Array.isArray(value)) {
            if (value.length > BoundaryLimits.maxArrayLength) {
                this.invalid(path, `Array exceeds ${BoundaryLimits.maxArrayLength} items`, "MAX_ITEMS");
            }
            value.forEach((item, index) => this.assertBounded(item, kind, depth + 1, `${path}.${index}`));
            return;
        }

        if (typeof value === "object") {
            const record = value as Record<string, unknown>;
            const keys = Object.keys(record);
            if (keys.length > BoundaryLimits.maxObjectKeys) {
                this.invalid(path, `Object exceeds ${BoundaryLimits.maxObjectKeys} fields`, "MAX_PROPERTIES");
            }
            for (const key of keys) {
                if (key === "__proto__" || key === "constructor" || key === "prototype") {
                    this.invalid(`${path}.${key}`, "Unsafe field name", "UNSAFE_FIELD");
                }
                this.assertBounded(record[key], kind, depth + 1, `${path}.${key}`);
            }
        }
    }

    private invalid(field: string, message: string, code: string): never {
        throw new BadRequestException({
            code: ErrorCodes.INVALID_INPUT,
            message: "The request contains invalid input.",
            details: [{ field, message, code }],
        });
    }
}

/** Exact executable schema pipe for endpoint bodies, query strings and params. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
    constructor(private readonly schema: ZodType<T>) {}

    transform(value: unknown): T {
        try {
            return this.schema.parse(value);
        } catch (error) {
            if (!(error instanceof ZodError)) throw error;
            throw new BadRequestException({
                code: ErrorCodes.INVALID_INPUT,
                message: "The request contains invalid input.",
                details: error.issues.map((issue) => ({
                    field: issue.path.join(".") || undefined,
                    message: issue.message,
                    code: issue.code,
                })),
            });
        }
    }
}
