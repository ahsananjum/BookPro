import {
    publicCreateHoldSchema,
    publicFinalizeBookingSchema,
    publicCreatePaymentIntentSchema,
    publicBookingStatusQuerySchema,
} from "@bookpro/validation";
import * as crypto from "crypto";

describe("P0-02 Public Booking & Payment Authority Enforcement", () => {
    const validUUID = "11111111-1111-1111-1111-111111111111";
    const validHoldId = "22222222-2222-2222-2222-222222222222";

    describe("1. Public Hold Creation Schema & Authority", () => {
        it("should reject client-provided customerId to prevent arbitrary customer impersonation", () => {
            const body = {
                locationId: validUUID,
                serviceId: validUUID,
                startAt: "2026-09-01T10:00:00Z",
                endAt: "2026-09-01T11:00:00Z",
                customerId: "unauthorized-client-chosen-customer-id",
            };
            expect(() => publicCreateHoldSchema.parse(body)).toThrow();
        });

        it("should reject client-provided price, quotes, or status fields", () => {
            const body = {
                locationId: validUUID,
                serviceId: validUUID,
                startAt: "2026-09-01T10:00:00Z",
                endAt: "2026-09-01T11:00:00Z",
                priceCents: 0,
                status: "ACTIVE",
            };
            expect(() => publicCreateHoldSchema.parse(body)).toThrow();
        });

        it("should accept valid public hold creation payload and allow optional guest identity data", () => {
            const body = {
                locationId: validUUID,
                serviceId: validUUID,
                startAt: "2026-09-01T10:00:00Z",
                endAt: "2026-09-01T11:00:00Z",
                guestName: "Jane Doe",
                guestEmail: "jane.doe@example.com",
                guestPhone: "+15551234567",
                partySize: 1,
            };
            const result = publicCreateHoldSchema.parse(body);
            expect(result.locationId).toBe(validUUID);
            expect(result.guestEmail).toBe("jane.doe@example.com");
        });
    });

    describe("2. Public Booking Finalization Schema & Authority", () => {
        it("should reject client-provided paymentStatus: 'PAID' or 'DEPOSIT_PAID'", () => {
            const body = {
                bookingHoldId: validHoldId,
                paymentStatus: "PAID",
            };
            expect(() => publicFinalizeBookingSchema.parse(body)).toThrow();
        });

        it("should reject client-provided status: 'CONFIRMED'", () => {
            const body = {
                bookingHoldId: validHoldId,
                status: "CONFIRMED",
            };
            expect(() => publicFinalizeBookingSchema.parse(body)).toThrow();
        });

        it("should reject client-provided customerId or price", () => {
            const body = {
                bookingHoldId: validHoldId,
                customerId: "victim-customer-id",
                priceCents: 0,
            };
            expect(() => publicFinalizeBookingSchema.parse(body)).toThrow();
        });

        it("should accept valid public finalize payload with bookingHoldId and guestToken", () => {
            const body = {
                bookingHoldId: validHoldId,
                guestToken: "valid-guest-hmac-token",
            };
            const result = publicFinalizeBookingSchema.parse(body);
            expect(result.bookingHoldId).toBe(validHoldId);
            expect(result.guestToken).toBe("valid-guest-hmac-token");
        });
    });

    describe("3. Public Payment Intent Creation Schema", () => {
        it("should reject client-supplied amountCents or currency", () => {
            const body = {
                bookingHoldId: validHoldId,
                amountCents: 100, // Attacker tries to pay $1 instead of full amount
                currency: "USD",
            };
            expect(() => publicCreatePaymentIntentSchema.parse(body)).toThrow();
        });

        it("should accept valid payment intent request containing only hold identifier and optional token", () => {
            const body = {
                bookingHoldId: validHoldId,
                guestToken: "gst_1234567890abcdef123456",
            };
            const result = publicCreatePaymentIntentSchema.parse(body);
            expect(result.bookingHoldId).toBe(validHoldId);
        });
    });

    describe("4. Public Booking Status Query Schema", () => {
        it("should validate booking status query with holdId", () => {
            const query = {
                holdId: validHoldId,
                guestToken: "gst_1234567890abcdef123456",
            };
            const result = publicBookingStatusQuerySchema.parse(query);
            expect(result.holdId).toBe(validHoldId);
        });

        it("should reject empty holdId query", () => {
            const query = {
                holdId: "",
            };
            expect(() => publicBookingStatusQuerySchema.parse(query)).toThrow();
        });
    });

    describe("5. Cryptographic Guest Token HMAC Verification", () => {
        const secret = "bookpro-guest-secret-2026";

        function generateGuestToken(holdId: string, orgId: string, email: string): string {
            return crypto
                .createHmac("sha256", secret)
                .update(`${holdId}:${orgId}:${email.toLowerCase().trim()}`)
                .digest("hex");
        }

        function verifyGuestToken(holdId: string, orgId: string, email: string, token: string): boolean {
            const expected = generateGuestToken(holdId, orgId, email);
            if (expected.length !== token.length) return false;
            return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
        }

        it("should verify valid guest token correctly", () => {
            const holdId = "hold-123";
            const orgId = "org-456";
            const email = "guest@example.com";
            const token = generateGuestToken(holdId, orgId, email);

            expect(verifyGuestToken(holdId, orgId, email, token)).toBe(true);
        });

        it("should reject tampered or cross-hold guest token", () => {
            const holdId = "hold-123";
            const otherHoldId = "hold-999";
            const orgId = "org-456";
            const email = "guest@example.com";
            const token = generateGuestToken(holdId, orgId, email);

            expect(verifyGuestToken(otherHoldId, orgId, email, token)).toBe(false);
            expect(verifyGuestToken(holdId, orgId, "other@example.com", token)).toBe(false);
        });
    });
});
