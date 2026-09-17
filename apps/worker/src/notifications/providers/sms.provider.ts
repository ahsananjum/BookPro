import { Injectable, Logger } from "@nestjs/common";
import { SendSmsInput, ProviderSendResult } from "@bookpro/contracts";

export interface SmsProvider {
    sendSms(input: SendSmsInput): Promise<ProviderSendResult>;
}

export const SMS_PROVIDER = Symbol("SMS_PROVIDER");

@Injectable()
export class TwilioSmsProvider implements SmsProvider {
    private readonly logger = new Logger(TwilioSmsProvider.name);

    async sendSms(input: SendSmsInput): Promise<ProviderSendResult> {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.SMS_FROM_NUMBER;

        if (!accountSid || !authToken || !fromNumber) {
            this.logger.warn("Twilio SMS configuration is incomplete.");
            return {
                success: false,
                error: "Twilio SMS provider is not configured with required credentials",
                isRetryable: false,
            };
        }

        if (!input.recipientPhone || input.recipientPhone.length < 7) {
            return {
                success: false,
                error: `Invalid destination phone number: "${input.recipientPhone}"`,
                isRetryable: false,
            };
        }

        try {
            this.logger.log(`Submitting transactional SMS via Twilio to ${input.recipientPhone}`);

            const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
            const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

            const bodyParams = new URLSearchParams();
            bodyParams.append("To", input.recipientPhone);
            bodyParams.append("From", fromNumber);
            bodyParams.append("Body", input.message);

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Basic ${credentials}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                },
                body: bodyParams.toString(),
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
                const errData: any = await response.json().catch(() => ({}));
                const errMsg = errData?.message || `Twilio returned HTTP ${response.status}`;
                const isRetryable = response.status === 429 || response.status >= 500;
                this.logger.error(`Twilio SMS delivery failed with HTTP ${response.status}: ${errMsg}`);
                return {
                    success: false,
                    error: errMsg,
                    isRetryable,
                };
            }

            const data = (await response.json()) as { sid?: string };
            this.logger.log(`Twilio accepted SMS (SID: ${data.sid || "ok"}).`);
            return {
                success: true,
                providerMessageId: data.sid,
            };
        } catch (error: any) {
            this.logger.error(`Twilio SMS network request failed: ${error?.name || error?.message || "network_error"}`);
            const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
            return {
                success: false,
                error: isTimeout ? "Twilio SMS request timed out" : "SMS provider is temporarily unavailable",
                isRetryable: true,
            };
        }
    }
}

@Injectable()
export class DisabledSmsProvider implements SmsProvider {
    private readonly logger = new Logger(DisabledSmsProvider.name);

    async sendSms(input: SendSmsInput): Promise<ProviderSendResult> {
        this.logger.log(`[DisabledSmsProvider] SMS dispatch skipped (Provider is disabled by configuration) for recipient: ${input.recipientPhone}`);
        return {
            success: false,
            error: "SMS provider is explicitly disabled by configuration",
            isRetryable: false,
        };
    }
}
