import { Injectable, Logger } from "@nestjs/common";
import { SendEmailInput, ProviderSendResult } from "@bookpro/contracts";

export interface EmailProvider {
    sendEmail(input: SendEmailInput): Promise<ProviderSendResult>;
}

export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

export function parseSenderAddress(senderRaw: string): { name: string; email: string } {
    const match = senderRaw.match(/^(?:(.*?)<)?([^>]+)>?$/);
    if (match && match[2]) {
        const name = (match[1] || "").trim() || "BookPro";
        const email = match[2].trim();
        return { name, email };
    }
    return { name: "BookPro", email: senderRaw.trim() };
}

@Injectable()
export class BrevoEmailProvider implements EmailProvider {
    private readonly logger = new Logger(BrevoEmailProvider.name);

    async sendEmail(input: SendEmailInput): Promise<ProviderSendResult> {
        const apiKey = process.env.BREVO_API_KEY;
        const configuredFrom = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM;
        if (!apiKey || !configuredFrom) {
            this.logger.warn("Brevo transactional email configuration is missing API key or sender email.");
            return {
                success: false,
                error: "Brevo transactional email configuration is missing API key or sender email.",
                isRetryable: false,
            };
        }

        try {
            const senderParsed = parseSenderAddress(input.senderEmail || configuredFrom);
            this.logger.log(`Submitting transactional email to Brevo for recipient: ${input.recipientEmail}`);

            const response = await fetch("https://api.brevo.com/v3/smtp/email", {
                method: "POST",
                headers: {
                    "api-key": apiKey,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                body: JSON.stringify({
                    sender: {
                        name: input.senderName || senderParsed.name,
                        email: senderParsed.email,
                    },
                    to: [
                        {
                            email: input.recipientEmail,
                        },
                    ],
                    subject: input.subject,
                    htmlContent: input.htmlBody,
                    textContent: input.textBody,
                    headers: input.idempotencyKey
                        ? {
                            idempotencyKey: input.idempotencyKey,
                            "X-Idempotency-Key": input.idempotencyKey,
                        }
                        : undefined,
                    attachment: (input as any).attachment,
                    tags: ["bookpro-transactional"],
                }),
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
                const errBody: any = await response.json().catch(() => ({}));
                const errMsg = errBody?.message || `Brevo API returned HTTP ${response.status}`;
                const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
                this.logger.error(`Brevo delivery failed with HTTP ${response.status}: ${errMsg}`);
                return { success: false, error: errMsg, isRetryable: retryable };
            }

            const data = (await response.json()) as { messageId?: string };
            this.logger.log(`Brevo accepted transactional email (Message ID: ${data.messageId || "ok"}).`);
            return { success: true, providerMessageId: data.messageId };
        } catch (error: any) {
            this.logger.error(`Brevo delivery network request failed: ${error?.name || error?.message || "network_error"}`);
            const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
            return {
                success: false,
                error: isTimeout ? "Brevo email provider request timed out" : "Email provider is temporarily unavailable",
                isRetryable: true,
            };
        }
    }
}

@Injectable()
export class DisabledEmailProvider implements EmailProvider {
    private readonly logger = new Logger(DisabledEmailProvider.name);

    async sendEmail(input: SendEmailInput): Promise<ProviderSendResult> {
        this.logger.log(`[DisabledEmailProvider] Email dispatch skipped (Provider is disabled by configuration) for recipient: ${input.recipientEmail}`);
        return {
            success: false,
            error: "Email provider is explicitly disabled by configuration",
            isRetryable: false,
        };
    }
}
