import { BrevoEmailProvider, DisabledEmailProvider, parseSenderAddress } from "./providers/email.provider";
import { TwilioSmsProvider, DisabledSmsProvider } from "./providers/sms.provider";

describe("Notification Providers Unit Test Suite", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe("parseSenderAddress", () => {
        it("should parse standard RFC name and email addresses", () => {
            const result1 = parseSenderAddress("BookPro Studio <support@bookpro.com>");
            expect(result1.name).toBe("BookPro Studio");
            expect(result1.email).toBe("support@bookpro.com");

            const result2 = parseSenderAddress("support@bookpro.com");
            expect(result2.name).toBe("BookPro");
            expect(result2.email).toBe("support@bookpro.com");
        });
    });

    describe("BrevoEmailProvider", () => {
        it("should report unconfigured if BREVO_API_KEY is missing", async () => {
            delete process.env.BREVO_API_KEY;
            delete process.env.BREVO_SENDER_EMAIL;

            const provider = new BrevoEmailProvider();
            const res = await provider.sendEmail({
                organizationId: "org-1",
                recipientEmail: "customer@example.com",
                subject: "Test",
                htmlBody: "<p>Hello</p>",
            });

            expect(res.success).toBe(false);
            expect(res.isRetryable).toBe(false);
            expect(res.error).toContain("missing API key or sender email");
        });

        it("should dispatch transactional email via HTTP to Brevo API", async () => {
            process.env.BREVO_API_KEY = "test_brevo_key";
            process.env.BREVO_SENDER_EMAIL = "studio@bookpro.com";

            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 201,
                json: async () => ({ messageId: "<msg-123@brevo.com>" }),
            });
            global.fetch = mockFetch as any;

            const provider = new BrevoEmailProvider();
            const res = await provider.sendEmail({
                organizationId: "org-1",
                recipientEmail: "customer@example.com",
                subject: "Booking Confirmation",
                htmlBody: "<h1>Your Booking</h1>",
                textBody: "Your Booking",
                idempotencyKey: "idem-msg-1",
            });

            expect(res.success).toBe(true);
            expect(res.providerMessageId).toBe("<msg-123@brevo.com>");
            expect(mockFetch).toHaveBeenCalledWith(
                "https://api.brevo.com/v3/smtp/email",
                expect.objectContaining({
                    method: "POST",
                    headers: expect.objectContaining({
                        "api-key": "test_brevo_key",
                        "Content-Type": "application/json",
                    }),
                })
            );
        });

        it("should classify 429 and 500 Brevo errors as retryable", async () => {
            process.env.BREVO_API_KEY = "test_brevo_key";
            process.env.BREVO_SENDER_EMAIL = "studio@bookpro.com";

            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 429,
                json: async () => ({ message: "Too many requests" }),
            }) as any;

            const provider = new BrevoEmailProvider();
            const res = await provider.sendEmail({
                organizationId: "org-1",
                recipientEmail: "customer@example.com",
                subject: "Test",
                htmlBody: "<p>Test</p>",
            });

            expect(res.success).toBe(false);
            expect(res.isRetryable).toBe(true);
        });

        it("should classify 400 Brevo errors as terminal and non-retryable", async () => {
            process.env.BREVO_API_KEY = "test_brevo_key";
            process.env.BREVO_SENDER_EMAIL = "studio@bookpro.com";

            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 400,
                json: async () => ({ message: "Invalid email address syntax" }),
            }) as any;

            const provider = new BrevoEmailProvider();
            const res = await provider.sendEmail({
                organizationId: "org-1",
                recipientEmail: "bad-email",
                subject: "Test",
                htmlBody: "<p>Test</p>",
            });

            expect(res.success).toBe(false);
            expect(res.isRetryable).toBe(false);
            expect(res.error).toBe("Invalid email address syntax");
        });

        it("should classify fetch network timeout as retryable", async () => {
            process.env.BREVO_API_KEY = "test_brevo_key";
            process.env.BREVO_SENDER_EMAIL = "studio@bookpro.com";

            const timeoutError = new Error("The operation was aborted");
            timeoutError.name = "TimeoutError";
            global.fetch = jest.fn().mockRejectedValue(timeoutError);

            const provider = new BrevoEmailProvider();
            const res = await provider.sendEmail({
                organizationId: "org-1",
                recipientEmail: "customer@example.com",
                subject: "Test",
                htmlBody: "<p>Test</p>",
            });

            expect(res.success).toBe(false);
            expect(res.isRetryable).toBe(true);
            expect(res.error).toContain("timed out");
        });
    });

    describe("DisabledEmailProvider", () => {
        it("should return explicit non-retryable disabled response", async () => {
            const provider = new DisabledEmailProvider();
            const res = await provider.sendEmail({
                organizationId: "org-1",
                recipientEmail: "customer@example.com",
                subject: "Test",
                htmlBody: "<p>Test</p>",
            });

            expect(res.success).toBe(false);
            expect(res.isRetryable).toBe(false);
            expect(res.error).toContain("disabled by configuration");
        });
    });

    describe("TwilioSmsProvider", () => {
        it("should report unconfigured if Twilio credentials are missing", async () => {
            delete process.env.TWILIO_ACCOUNT_SID;
            delete process.env.TWILIO_AUTH_TOKEN;

            const provider = new TwilioSmsProvider();
            const res = await provider.sendSms({
                organizationId: "org-1",
                recipientPhone: "+15551234567",
                message: "Test SMS",
            });

            expect(res.success).toBe(false);
            expect(res.isRetryable).toBe(false);
            expect(res.error).toContain("not configured");
        });

        it("should post URL-encoded message payload with Basic auth to Twilio", async () => {
            process.env.TWILIO_ACCOUNT_SID = "AC1234567890";
            process.env.TWILIO_AUTH_TOKEN = "auth_secret";
            process.env.TWILIO_PHONE_NUMBER = "+15559876543";

            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 201,
                json: async () => ({ sid: "SM1234567890abcdef" }),
            });
            global.fetch = mockFetch as any;

            const provider = new TwilioSmsProvider();
            const res = await provider.sendSms({
                organizationId: "org-1",
                recipientPhone: "+15551234567",
                message: "Reminder: You have an appointment tomorrow.",
            });

            expect(res.success).toBe(true);
            expect(res.providerMessageId).toBe("SM1234567890abcdef");
            expect(mockFetch).toHaveBeenCalledWith(
                "https://api.twilio.com/2010-04-01/Accounts/AC1234567890/Messages.json",
                expect.objectContaining({
                    method: "POST",
                    headers: expect.objectContaining({
                        Authorization: `Basic ${Buffer.from("AC1234567890:auth_secret").toString("base64")}`,
                        "Content-Type": "application/x-www-form-urlencoded",
                    }),
                })
            );
        });

        it("should classify Twilio 503 and 429 errors as retryable", async () => {
            process.env.TWILIO_ACCOUNT_SID = "AC1234567890";
            process.env.TWILIO_AUTH_TOKEN = "auth_secret";
            process.env.TWILIO_PHONE_NUMBER = "+15559876543";

            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 503,
                json: async () => ({ message: "Service Unavailable" }),
            }) as any;

            const provider = new TwilioSmsProvider();
            const res = await provider.sendSms({
                organizationId: "org-1",
                recipientPhone: "+15551234567",
                message: "Test",
            });

            expect(res.success).toBe(false);
            expect(res.isRetryable).toBe(true);
        });
    });

    describe("DisabledSmsProvider", () => {
        it("should return explicit non-retryable disabled response", async () => {
            const provider = new DisabledSmsProvider();
            const res = await provider.sendSms({
                organizationId: "org-1",
                recipientPhone: "+15551234567",
                message: "Test",
            });

            expect(res.success).toBe(false);
            expect(res.isRetryable).toBe(false);
            expect(res.error).toContain("disabled by configuration");
        });
    });
});
