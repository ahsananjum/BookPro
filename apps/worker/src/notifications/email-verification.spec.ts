import { BrevoEmailProvider } from "./providers/email.provider";
import { NotificationTemplateEngineService } from "./template-engine.service";

describe("email verification delivery", () => {
    const originalEnv = process.env;
    const originalFetch = global.fetch;

    afterEach(() => {
        process.env = originalEnv;
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it("renders a six-digit code without an activation link", () => {
        const rendered = new NotificationTemplateEngineService().render("email_verification", {
            fullName: "Avery Stone",
            verificationCode: "482901",
            expiresInMinutes: 15,
        });

        expect(rendered.subject).toBe("Complete your BookPro registration");
        expect(rendered.htmlBody).toContain("482901");
        expect(rendered.textBody).toContain("482901");
        expect(rendered.htmlBody).not.toContain("verificationUrl");
        expect(rendered.htmlBody).not.toContain("href=");
        expect(rendered.textBody).not.toContain("http");
    });

    it("sends through Brevo with a server-side key and idempotency header", async () => {
        process.env = {
            ...originalEnv,
            BREVO_API_KEY: "server-secret",
            BREVO_SENDER_EMAIL: "BookPro <verified@example.com>",
        };
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ messageId: "brevo-message-id" }),
        });
        global.fetch = fetchMock as typeof fetch;

        const result = await new BrevoEmailProvider().sendEmail({
            organizationId: "00000000-0000-0000-0000-000000000001",
            recipientEmail: "owner@example.com",
            subject: "Complete your BookPro registration",
            htmlBody: "<p>482901</p>",
            textBody: "482901",
            idempotencyKey: "00000000-0000-0000-0000-000000000123",
        });

        expect(result).toEqual({ success: true, providerMessageId: "brevo-message-id" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, request] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.brevo.com/v3/smtp/email");
        expect(request.headers["api-key"]).toBe("server-secret");
        const body = JSON.parse(request.body);
        expect(body.sender).toEqual({ name: "BookPro", email: "verified@example.com" });
        expect(body.headers.idempotencyKey).toBe("00000000-0000-0000-0000-000000000123");
        expect(JSON.stringify(body)).not.toContain("RESEND");
    });

    it("fails closed when Brevo configuration is absent", async () => {
        process.env = { ...originalEnv, BREVO_API_KEY: "", BREVO_SENDER_EMAIL: "", EMAIL_FROM: "" };
        const fetchMock = jest.fn();
        global.fetch = fetchMock as typeof fetch;

        const result = await new BrevoEmailProvider().sendEmail({
            organizationId: "00000000-0000-0000-0000-000000000001",
            recipientEmail: "owner@example.com",
            subject: "Confirm email",
            htmlBody: "<p>482901</p>",
            textBody: "482901",
        });

        expect(result.success).toBe(false);
        expect(result.isRetryable).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
