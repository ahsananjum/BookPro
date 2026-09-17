import { Injectable, Logger, BadRequestException, UnauthorizedException } from "@nestjs/common";
import {
    PaymentProvider,
    CreatePaymentIntentInput,
    ProviderPaymentResult,
    ProviderRefundInput,
    ProviderRefundResult,
    VerifiedWebhookEvent,
    ProviderPaymentState,
    PaymentProviderDisabledException,
} from "./payment-provider.interface";
import type Stripe from "stripe";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const StripeSDK = require("stripe");

@Injectable()
export class StripePaymentAdapter implements PaymentProvider {
    private readonly logger = new Logger(StripePaymentAdapter.name);
    private readonly stripe: Stripe | null = null;
    private readonly mode: "disabled" | "test" | "live";
    private readonly webhookSecret: string | null = null;

    constructor() {
        const modeEnv = (process.env.STRIPE_MODE || "disabled").toLowerCase();
        if (modeEnv === "test" || modeEnv === "live") {
            this.mode = modeEnv;
        } else {
            this.mode = "disabled";
        }

        if (this.mode !== "disabled") {
            const apiKey = process.env.STRIPE_SECRET_KEY;
            const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

            if (!apiKey) {
                this.logger.error(`Stripe mode is '${this.mode}' but STRIPE_SECRET_KEY is missing.`);
                throw new Error(`STRIPE_SECRET_KEY is required when STRIPE_MODE is '${this.mode}'`);
            }

            if (!webhookSecret) {
                this.logger.error(`Stripe mode is '${this.mode}' but STRIPE_WEBHOOK_SECRET is missing.`);
                throw new Error(`STRIPE_WEBHOOK_SECRET is required when STRIPE_MODE is '${this.mode}'`);
            }

            this.webhookSecret = webhookSecret;
            const StripeCtor = typeof StripeSDK === "function" ? StripeSDK : (StripeSDK.default || StripeSDK);
            this.stripe = new StripeCtor(apiKey, {
                apiVersion: "2026-07-29.dahlia" as any,
            });
        }
    }

    getMode(): "disabled" | "test" | "live" {
        return this.mode;
    }

    async createPaymentIntent(input: CreatePaymentIntentInput): Promise<ProviderPaymentResult> {
        if (this.mode === "disabled" || !this.stripe) {
            throw new PaymentProviderDisabledException("Stripe payments are disabled");
        }

        const currency = (input.currency || "USD").toLowerCase();

        try {
            const requestOptions: Stripe.RequestOptions = {};
            if (input.idempotencyKey) {
                requestOptions.idempotencyKey = input.idempotencyKey;
            }

            const baseParams: Stripe.PaymentIntentCreateParams = {
                amount: input.amountCents,
                currency,
                payment_method_types: ["card"],
                metadata: {
                    organizationId: input.organizationId,
                    holdId: input.holdId || "",
                    appointmentId: input.appointmentId || "",
                    ...(input.metadata || {}),
                },
            };

            let intent: Stripe.PaymentIntent;
            let chargePattern: "DIRECT" | "DESTINATION" = "DIRECT";
            let clientConnectedAccountId: string | undefined = input.connectedAccountId;

            if (input.connectedAccountId) {
                let supportsDirectCard = true;
                try {
                    const acct = await this.stripe.accounts.retrieve(input.connectedAccountId);
                    if (acct.capabilities?.card_payments !== "active") {
                        supportsDirectCard = false;
                    }
                } catch {
                    supportsDirectCard = false;
                }

                if (supportsDirectCard) {
                    chargePattern = "DIRECT";
                    clientConnectedAccountId = input.connectedAccountId;
                    intent = await this.stripe.paymentIntents.create(
                        baseParams,
                        { ...requestOptions, stripeAccount: input.connectedAccountId }
                    );
                } else {
                    chargePattern = "DESTINATION";
                    clientConnectedAccountId = undefined;
                    intent = await this.stripe.paymentIntents.create(
                        {
                            ...baseParams,
                            transfer_data: {
                                destination: input.connectedAccountId,
                            },
                        },
                        requestOptions
                    );
                }
            } else {
                intent = await this.stripe.paymentIntents.create(baseParams, requestOptions);
            }

            return {
                providerPaymentId: intent.id,
                clientSecret: intent.client_secret || "",
                amountCents: intent.amount,
                currency: intent.currency.toUpperCase(),
                status: intent.status,
                chargePattern,
                clientConnectedAccountId,
            };
        } catch (err: any) {
            this.logger.error(`Stripe createPaymentIntent failed: ${err.message}`);
            throw new BadRequestException("The payment provider could not create this payment");
        }
    }

    async cancelPaymentIntent(providerPaymentId: string, connectedAccountId?: string): Promise<{ status: string }> {
        if (this.mode === "disabled" || !this.stripe) {
            throw new PaymentProviderDisabledException("Stripe payments are disabled");
        }

        try {
            const requestOptions: Stripe.RequestOptions = {};
            if (connectedAccountId) {
                requestOptions.stripeAccount = connectedAccountId;
            }

            const intent = await this.stripe.paymentIntents.cancel(
                providerPaymentId,
                {},
                Object.keys(requestOptions).length > 0 ? requestOptions : undefined
            );

            return { status: intent.status };
        } catch (err: any) {
            this.logger.warn(`Stripe cancelPaymentIntent for ${providerPaymentId} returned: ${err.message}`);
            return { status: "failed_or_already_canceled" };
        }
    }

    async refund(input: ProviderRefundInput): Promise<ProviderRefundResult> {
        if (this.mode === "disabled" || !this.stripe) {
            throw new PaymentProviderDisabledException("Stripe payments are disabled");
        }

        try {
            // Stripe strictly requires reason to be one of: 'duplicate' | 'fraudulent' | 'requested_by_customer'
            let stripeReason: "duplicate" | "fraudulent" | "requested_by_customer" = "requested_by_customer";
            if (input.reason === "duplicate" || input.reason === "fraudulent" || input.reason === "requested_by_customer") {
                stripeReason = input.reason;
            }

            const baseRefundParams: Stripe.RefundCreateParams = {
                payment_intent: input.providerPaymentId,
                amount: input.amountCents,
                reason: stripeReason,
                metadata: input.reason ? { cancellationReason: String(input.reason).slice(0, 500) } : undefined,
            };

            const baseRequestOptions: Stripe.RequestOptions = {};
            if (input.idempotencyKey) {
                baseRequestOptions.idempotencyKey = input.idempotencyKey;
            }

            let refund: Stripe.Refund;

            // When a connected account is involved (Stripe Connect multi-tenant organization):
            if (input.connectedAccountId) {
                const isDirect = input.chargePattern === "DIRECT";

                if (isDirect) {
                    try {
                        // Direct charge: charge lives on the connected account -> refund from connected account directly
                        refund = await this.stripe.refunds.create(
                            baseRefundParams,
                            { ...baseRequestOptions, stripeAccount: input.connectedAccountId }
                        );
                    } catch (directErr: any) {
                        this.logger.warn(
                            `Direct refund with stripeAccount ${input.connectedAccountId} failed (${directErr.message}). Retrying destination reverse_transfer on platform...`
                        );
                        // Fallback: destination charge on platform with reverse_transfer
                        refund = await this.stripe.refunds.create(
                            {
                                ...baseRefundParams,
                                reverse_transfer: true,
                                refund_application_fee: true,
                            },
                            baseRequestOptions
                        );
                    }
                } else {
                    try {
                        // Destination charge: charge is on platform with funds transferred to connected account
                        // reverse_transfer=true pulls funds directly from organization's connected account
                        refund = await this.stripe.refunds.create(
                            {
                                ...baseRefundParams,
                                reverse_transfer: true,
                                refund_application_fee: true,
                            },
                            baseRequestOptions
                        );
                    } catch (destErr: any) {
                        this.logger.warn(
                            `Destination refund failed (${destErr.message}). Retrying on connected account ${input.connectedAccountId}...`
                        );
                        // Fallback: direct charge on connected account
                        refund = await this.stripe.refunds.create(
                            baseRefundParams,
                            { ...baseRequestOptions, stripeAccount: input.connectedAccountId }
                        );
                    }
                }
            } else {
                // Standard platform-only refund
                refund = await this.stripe.refunds.create(
                    baseRefundParams,
                    baseRequestOptions
                );
            }

            return {
                providerRefundId: refund.id,
                amountCents: refund.amount,
                currency: refund.currency.toUpperCase(),
                status: refund.status || "succeeded",
            };
        } catch (err: any) {
            this.logger.error(`Stripe refund failed: ${err.message}`);
            throw new BadRequestException("The payment provider could not process this refund");
        }
    }

    async verifyWebhook(rawBody: string | Buffer, signatureHeader: string): Promise<VerifiedWebhookEvent> {
        if (this.mode === "disabled" || !this.stripe || !this.webhookSecret) {
            throw new PaymentProviderDisabledException("Stripe payments are disabled");
        }

        if (!signatureHeader) {
            throw new BadRequestException("Missing payment provider signature header (stripe-signature)");
        }

        try {
            const event = this.stripe.webhooks.constructEvent(
                rawBody,
                signatureHeader,
                this.webhookSecret
            );

            const dataObject = event.data.object as any;
            return {
                eventId: event.id,
                eventType: event.type,
                livemode: Boolean(event.livemode),
                account: event.account,
                providerPaymentId: dataObject?.id,
                amountCents: dataObject?.amount,
                currency: dataObject?.currency ? dataObject.currency.toUpperCase() : undefined,
                status: dataObject?.status,
                metadata: (dataObject?.metadata as Record<string, string>) || {},
                rawPayload: event,
            };
        } catch (err: any) {
            this.logger.warn(`Stripe webhook signature verification failed: ${err.message}`);
            throw new UnauthorizedException("Invalid webhook signature");
        }
    }

    async retrievePayment(providerPaymentId: string, connectedAccountId?: string): Promise<ProviderPaymentState> {
        if (this.mode === "disabled" || !this.stripe) {
            throw new PaymentProviderDisabledException("Stripe payments are disabled");
        }

        try {
            let intent: Stripe.PaymentIntent | null = null;
            if (connectedAccountId) {
                try {
                    intent = await this.stripe.paymentIntents.retrieve(
                        providerPaymentId,
                        {},
                        { stripeAccount: connectedAccountId }
                    );
                } catch {
                    // Fallback to platform account (used for destination charges)
                    intent = await this.stripe.paymentIntents.retrieve(providerPaymentId);
                }
            } else {
                intent = await this.stripe.paymentIntents.retrieve(providerPaymentId);
            }

            return {
                providerPaymentId: intent.id,
                amountCents: intent.amount,
                currency: intent.currency.toUpperCase(),
                status: intent.status as any,
                metadata: (intent.metadata as any) || {},
            };
        } catch (err: any) {
            this.logger.error(`Stripe retrievePayment failed for ${providerPaymentId}: ${err.message}`);
            throw new BadRequestException("The payment provider could not retrieve this payment");
        }
    }

    async retrieveRefund(providerRefundId: string): Promise<ProviderRefundResult> {
        if (this.mode === "disabled" || !this.stripe) {
            throw new PaymentProviderDisabledException("Stripe payments are disabled");
        }

        try {
            const refund = await this.stripe.refunds.retrieve(providerRefundId);
            return {
                providerRefundId: refund.id,
                amountCents: refund.amount,
                currency: refund.currency.toUpperCase(),
                status: refund.status || "succeeded",
            };
        } catch (err: any) {
            this.logger.error(`Stripe retrieveRefund failed for ${providerRefundId}: ${err.message}`);
            throw new BadRequestException("The payment provider could not retrieve this refund");
        }
    }
}
