export interface CreatePaymentIntentInput {
    amountCents: number;
    currency: string;
    organizationId: string;
    connectedAccountId?: string;
    holdId?: string;
    appointmentId?: string;
    idempotencyKey?: string;
    metadata?: Record<string, string>;
}

export interface ProviderPaymentResult {
    providerPaymentId: string;
    clientSecret: string;
    amountCents: number;
    currency: string;
    status: string;
    chargePattern?: "DIRECT" | "DESTINATION";
    clientConnectedAccountId?: string;
}

export interface ProviderRefundInput {
    providerPaymentId: string;
    amountCents: number;
    currency?: string;
    connectedAccountId?: string;
    chargePattern?: "DIRECT" | "DESTINATION";
    reverseTransfer?: boolean;
    refundApplicationFee?: boolean;
    reason?: string;
    idempotencyKey?: string;
}

export interface ProviderRefundResult {
    providerRefundId: string;
    amountCents: number;
    currency: string;
    status: string;
}

export interface VerifiedWebhookEvent {
    eventId: string;
    eventType: string;
    livemode: boolean;
    account?: string;
    providerPaymentId?: string;
    amountCents?: number;
    currency?: string;
    status?: string;
    metadata?: Record<string, string>;
    rawPayload: any;
}

export interface ProviderPaymentState {
    providerPaymentId: string;
    amountCents: number;
    currency: string;
    status: "succeeded" | "pending" | "failed" | "canceled" | "requires_action";
    metadata: Record<string, string>;
}

export class PaymentProviderDisabledException extends Error {
    constructor(message = "Stripe payment provider is disabled in configuration") {
        super(message);
        this.name = "PaymentProviderDisabledException";
    }
}

export const PAYMENT_PROVIDER = "PAYMENT_PROVIDER";

export interface PaymentProvider {
    createPaymentIntent(input: CreatePaymentIntentInput): Promise<ProviderPaymentResult>;
    cancelPaymentIntent?(providerPaymentId: string, connectedAccountId?: string): Promise<{ status: string }>;
    refund(input: ProviderRefundInput): Promise<ProviderRefundResult>;
    verifyWebhook(rawBody: string | Buffer, signatureHeader: string): Promise<VerifiedWebhookEvent>;
    retrievePayment(providerPaymentId: string, connectedAccountId?: string): Promise<ProviderPaymentState>;
    retrieveRefund?(providerRefundId: string): Promise<ProviderRefundResult>;
}
