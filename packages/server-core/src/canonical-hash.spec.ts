import { canonicalJsonStringify, computeCanonicalRequestHash } from "./canonical-hash.util";

describe("Canonical Request Hashing", () => {
    it("should produce identical canonical strings for objects with different key order", () => {
        const obj1 = { b: 2, a: 1, c: { y: "hello", x: "world" } };
        const obj2 = { a: 1, c: { x: "world", y: "hello" }, b: 2 };

        expect(canonicalJsonStringify(obj1)).toBe(canonicalJsonStringify(obj2));
        expect(canonicalJsonStringify(obj1)).toBe('{"a":1,"b":2,"c":{"x":"world","y":"hello"}}');
    });

    it("should produce identical SHA-256 hashes for equivalent objects with differing key order", () => {
        const payloadA = {
            organizationId: "11111111-1111-4111-8111-111111111111",
            amountCents: 5000,
            currency: "USD",
            items: [
                { id: "item-1", name: "Service A", tags: ["a", "b"] },
                { id: "item-2", name: "Service B", tags: ["c", "d"] },
            ],
            nested: { z: 26, a: 1 },
        };

        const payloadB = {
            nested: { a: 1, z: 26 },
            currency: "USD",
            amountCents: 5000,
            items: [
                { name: "Service A", id: "item-1", tags: ["a", "b"] },
                { tags: ["c", "d"], name: "Service B", id: "item-2" },
            ],
            organizationId: "11111111-1111-4111-8111-111111111111",
        };

        const hashA = computeCanonicalRequestHash(payloadA);
        const hashB = computeCanonicalRequestHash(payloadB);

        expect(hashA).toBe(hashB);
        expect(hashA).toHaveLength(64); // SHA-256 hex string length
    });

    it("should produce different hashes for payloads with different values", () => {
        const payload1 = { amountCents: 5000, currency: "USD" };
        const payload2 = { amountCents: 5001, currency: "USD" };

        const hash1 = computeCanonicalRequestHash(payload1);
        const hash2 = computeCanonicalRequestHash(payload2);

        expect(hash1).not.toBe(hash2);
    });

    it("should ignore undefined properties in objects", () => {
        const payload1 = { a: 1, b: undefined };
        const payload2 = { a: 1 };

        expect(canonicalJsonStringify(payload1)).toBe(canonicalJsonStringify(payload2));
        expect(computeCanonicalRequestHash(payload1)).toBe(computeCanonicalRequestHash(payload2));
    });

    it("should handle null, empty objects, and primitive arrays safely", () => {
        expect(canonicalJsonStringify(null)).toBe("null");
        expect(canonicalJsonStringify({})).toBe("{}");
        expect(canonicalJsonStringify([])).toBe("[]");
        expect(canonicalJsonStringify([3, 2, 1])).toBe("[3,2,1]");
    });
});
