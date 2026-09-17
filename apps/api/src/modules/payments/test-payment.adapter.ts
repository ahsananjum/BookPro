import { Injectable, BadRequestException, UnauthorizedException } from "@nestjs/common";
import {
    PaymentProvider,
    CreatePaymentIntentInput,
    ProviderPaymentResult,
    ProviderRefundInput,
    ProviderRefundResult,
    VerifiedWebhookEvent,
    ProviderPaymentState,
} from "./payment-provider.interface";
import * as crypto from "crypto";

@Injectable()
export class TestPaymentAdapter implements PaymentProvider {
    private simulatedPayments = new Map<string, ProviderPaymentState>();
    private simulateTimeout = false;
    private simulateSignatureFailure = false;
    private livemode = false;

    setSimulateTimeout(value: boolean) {
        this.simulateTimeout = value;
    }

    setSimulateSignatureFailure(value: boolean) {
        this.simulateSignatureFailure = value;
    }

    setLivemode(value: boolean) {
        this.livemode = value;
    }

    setPaymentState(providerPaymentId: string, state: ProviderPaymentState) {
        this.simulatedPayments.set(providerPaymentId, state);
    }

    async createPaymentIntent(input: CreatePaymentIntentInput): Promise<ProviderPaymentResult> {
        if (this.simulateTimeout) {
            throw new BadRequestException("Payment provider connection timeout");
        }

        const providerPaymentId = `pi_test_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
        const clientSecret = `${providerPaymentId}_secret_${crypto.randomBytes(6).toString("hex")}`;
        const currency = (input.currency || "USD").toUpperCase();

        const state: ProviderPaymentState = {
            providerPaymentId,
            amountCents: input.amountCents,
            currency,
            status: "pending",
            metadata: {
                organizationId: input.organizationId,
                holdId: input.holdId || "",
                appointmentId: input.appointmentId || "",
                ...(input.metadata || {}),
            },
        };
        this.simulatedPayments.set(providerPaymentId, state);

        return {
            providerPaymentId,
            clientSecret,
            amountCents: input.amountCents,
            currency,
            status: "requires_payment_method",
        };
    }

    async refund(input: ProviderRefundInput): Promise<ProviderRefundResult> {
        if (this.simulateTimeout) {
            throw new BadRequestException("Payment provider connection timeout");
        }

        const providerRefundId = `re_test_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
        return {
            providerRefundId,
            amountCents: input.amountCents,
            currency: (input.currency || "USD").toUpperCase(),
            status: "succeeded",
        };
    }

    async verifyWebhook(rawBody: string | Buffer, signatureHeader: string): Promise<VerifiedWebhookEvent> {
        if (this.simulateSignatureFailure || signatureHeader === "invalid_signature" || !signatureHeader) {
            throw new UnauthorizedException("Invalid webhook signature: test failure");
        }

        let parsed: any;
        if (typeof rawBody === "string") {
            try {
                parsed = JSON.parse(rawBody);
            } catch {
                parsed = {};
            }
        } else if (Buffer.isBuffer(rawBody)) {
            try {
                parsed = JSON.parse(rawBody.toString("utf-8"));
            } catch {
                parsed = {};
            }
        } else {
            parsed = rawBody || {};
        }

        const dataObject = parsed?.data?.object || parsed?.data || parsed;
        const eventId = parsed?.id || `evt_test_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
        const eventType = parsed?.type || "payment_intent.succeeded";

        return {
            eventId,
            eventType,
            livemode: typeof parsed?.livemode === "boolean" ? parsed.livemode : this.livemode,
            account: parsed?.account,
            providerPaymentId: dataObject?.id || dataObject?.paymentIntentId,
            amountCents: dataObject?.amount,
            currency: dataObject?.currency ? dataObject.currency.toUpperCase() : undefined,
            status: dataObject?.status || "succeeded",
            metadata: dataObject?.metadata || {},
            rawPayload: parsed,
        };
    }

    async cancelPaymentIntent(providerPaymentId: string, connectedAccountId?: string): Promise<{ status: string }> {
        if (this.simulateTimeout) {
            throw new BadRequestException("Payment provider connection timeout");
        }

        const existing = this.simulatedPayments.get(providerPaymentId);
        if (existing) {
            existing.status = "canceled";
            this.simulatedPayments.set(providerPaymentId, existing);
        }

        return { status: "canceled" };
    }

    async retrievePayment(providerPaymentId: string, connectedAccountId?: string): Promise<ProviderPaymentState> {
        if (this.simulateTimeout) {
            throw new BadRequestException("Payment provider connection timeout");
        }

        const existing = this.simulatedPayments.get(providerPaymentId);
        if (existing) {
            return existing;
        }

        return {
            providerPaymentId,
            amountCents: 5000,
            currency: "USD",
            status: "succeeded",
            metadata: {},
        };
    }
}
