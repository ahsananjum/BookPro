import * as crypto from "crypto";

/**
 * Deterministically serializes any JavaScript value / object into a canonical JSON string.
 * - Object keys are recursively sorted alphabetically.
 * - Arrays preserve element order while recursively canonicalizing their items.
 * - Dates are normalized to ISO-8601 UTC strings.
 * - Undefined properties in objects are omitted.
 * - Numbers, booleans, strings, and null are normalized.
 */
export function canonicalJsonStringify(value: unknown): string {
    if (value === null || value === undefined) {
        return "null";
    }

    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }

    if (typeof value === "number") {
        if (Number.isNaN(value) || !Number.isFinite(value)) {
            return "null";
        }
        return JSON.stringify(value);
    }

    if (typeof value === "boolean" || typeof value === "string") {
        return JSON.stringify(value);
    }

    if (typeof value === "bigint") {
        return JSON.stringify(value.toString());
    }

    if (Buffer.isBuffer(value)) {
        return JSON.stringify(value.toString("base64"));
    }

    if (Array.isArray(value)) {
        const items = value.map((item) => canonicalJsonStringify(item));
        return `[${items.join(",")}]`;
    }

    if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const sortedKeys = Object.keys(obj).sort();
        const entries: string[] = [];

        for (const key of sortedKeys) {
            const val = obj[key];
            if (val !== undefined && typeof val !== "function" && typeof val !== "symbol") {
                entries.push(`${JSON.stringify(key)}:${canonicalJsonStringify(val)}`);
            }
        }

        return `{${entries.join(",")}}`;
    }

    return JSON.stringify(String(value));
}

/**
 * Computes a deterministic SHA-256 hash (hex encoded) for a request payload.
 * Guarantees that equivalent payloads with different key orders produce identical hashes.
 */
export function computeCanonicalRequestHash(payload: unknown): string {
    const canonicalString = canonicalJsonStringify(payload ?? {});
    return crypto.createHash("sha256").update(canonicalString, "utf8").digest("hex");
}
