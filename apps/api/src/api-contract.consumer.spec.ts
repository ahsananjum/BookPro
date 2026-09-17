import { ArgumentsHost, BadRequestException } from "@nestjs/common";
import { BoundaryValidationPipe, GlobalExceptionFilter } from "@bookpro/server-core";
import { registerBusinessSchema, publicJoinWaitlistSchema } from "@bookpro/validation";

describe("public API consumer contract", () => {
    it("rejects undeclared fields on write contracts", () => {
        expect(() => registerBusinessSchema.parse({
            fullName: "Book Pro Owner",
            email: "owner@example.com",
            password: "StrongPassword123",
            organizationName: "Book Pro",
            organizationSlug: "book-pro",
            timezone: "UTC",
            currency: "USD",
            isPlatformAdmin: true,
        })).toThrow();

        expect(() => publicJoinWaitlistSchema.parse({
            serviceId: "11111111-1111-4111-8111-111111111111",
            startWindowDate: "2026-09-01",
            endWindowDate: "2026-09-02",
            guestName: "Customer",
            guestEmail: "customer@example.com",
            customerId: "22222222-2222-4222-8222-222222222222",
        })).toThrow();
    });

    it("bounds every generic request boundary", () => {
        const pipe = new BoundaryValidationPipe();
        expect(() => pipe.transform("x".repeat(2_049), { type: "query", data: "q" })).toThrow(BadRequestException);
        expect(() => pipe.transform(Array.from({ length: 501 }), { type: "body" })).toThrow(BadRequestException);
    });

    it("publishes a stable problem document without reflecting provider text", () => {
        const json = jest.fn();
        const type = jest.fn().mockReturnValue({ json });
        const status = jest.fn().mockReturnValue({ type });
        const request = {
            originalUrl: "/api/v1/payments/public/intents?secret=value",
            context: { requestId: "req-123", correlationId: "corr-123" },
        };
        const host = {
            switchToHttp: () => ({
                getResponse: () => ({ status }),
                getRequest: () => request,
            }),
        } as unknown as ArgumentsHost;

        new GlobalExceptionFilter().catch(
            new BadRequestException("Payment provider error: sk_live_sensitive upstream detail"),
            host,
        );

        expect(status).toHaveBeenCalledWith(400);
        expect(type).toHaveBeenCalledWith("application/problem+json");
        expect(json).toHaveBeenCalledWith(expect.objectContaining({
            type: "https://api.bookpro.local/problems/invalid-input",
            title: "Invalid Request",
            status: 400,
            detail: "The request contains invalid input.",
            instance: "/api/v1/payments/public/intents",
            code: "INVALID_INPUT",
            requestId: "req-123",
            correlationId: "corr-123",
        }));
        expect(JSON.stringify(json.mock.calls)).not.toContain("sk_live_sensitive");
    });
});
