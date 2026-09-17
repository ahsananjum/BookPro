import { Injectable, Logger } from "@nestjs/common";
import type Stripe from "stripe";
import {
    ConnectAccountSnapshot,
    ConnectProviderError,
    CreateConnectAccountInput,
    StripeConnectProvider,
} from "./stripe-connect-provider.interface";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const StripeSDK = require("stripe");

@Injectable()
export class StripeConnectAdapter implements StripeConnectProvider {
    private readonly logger = new Logger(StripeConnectAdapter.name);
    private readonly stripe: Stripe | null;
    private readonly clientId: string | null;

    constructor() {
        const mode = (process.env.STRIPE_MODE || "disabled").toLowerCase();
        const key = process.env.STRIPE_SECRET_KEY;
        this.clientId = process.env.STRIPE_CLIENT_ID || null;
        if ((mode === "test" || mode === "live") && key) {
            const StripeCtor = typeof StripeSDK === "function" ? StripeSDK : (StripeSDK.default || StripeSDK);
            this.stripe = new StripeCtor(key, { apiVersion: "2026-07-29.dahlia" as any });
        } else {
            this.stripe = null;
        }
    }

    isConfigured() { return Boolean(this.stripe); }
    usesOAuth() { return Boolean(this.clientId?.startsWith("ca_")); }

    buildOAuthUrl(state: string): string {
        if (!this.clientId) throw new ConnectProviderError("build_oauth_url");
        const redirectUri = `${process.env.API_BASE_URL || "http://localhost:4000"}/api/v1/payments/stripe/connect-callback`;
        const params = new URLSearchParams({ response_type: "code", client_id: this.clientId, scope: "read_write", state, redirect_uri: redirectUri });
        return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
    }

    async exchangeOAuthCode(code: string): Promise<string> {
        const stripe = this.requireClient();
        try {
            const result = await stripe.oauth.token({ grant_type: "authorization_code", code });
            if (!result.stripe_user_id) throw new Error("OAuth response omitted account identifier");
            return result.stripe_user_id;
        } catch (error) {
            this.logger.warn("Stripe rejected an OAuth code exchange");
            throw new ConnectProviderError("oauth_exchange", error);
        }
    }

    async createAccount(input: CreateConnectAccountInput): Promise<string> {
        const stripe = this.requireClient();
        const country = (input.country || "US").toUpperCase();

        // 1. Attempt standard Core Express account creation (card_payments + transfers)
        try {
            const account = await stripe.accounts.create({
                type: "express",
                country,
                email: input.email,
                business_type: "individual",
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
                metadata: { organizationId: input.organizationId },
            });
            return account.id;
        } catch (error: any) {
            const msg = error?.message || "";
            const param = error?.raw?.param || "";

            // 2. If country is cross-border or requires recipient service agreement (e.g. PK, IN, etc.)
            if (
                msg.includes("card_payments") ||
                msg.includes("service agreement") ||
                msg.includes("recipient") ||
                param === "requested_capabilities" ||
                param === "tos_acceptance"
            ) {
                this.logger.log(`Attempting cross-border recipient account creation for ${country}...`);
                try {
                    const fallbackAccount = await stripe.accounts.create({
                        type: "express",
                        country,
                        email: input.email,
                        business_type: "individual",
                        capabilities: {
                            transfers: { requested: true },
                        },
                        tos_acceptance: {
                            service_agreement: "recipient",
                        },
                        metadata: { organizationId: input.organizationId },
                    });
                    return fallbackAccount.id;
                } catch (fallbackError: any) {
                    this.logger.error(`Stripe fallback account creation failed for ${country}: ${fallbackError.message}`);
                    throw new ConnectProviderError(fallbackError.message || "account_create_fallback", fallbackError);
                }
            }

            this.logger.warn(`Stripe rejected connected-account creation for ${country}: ${error.message}`);
            throw new ConnectProviderError(error.message || "account_create", error);
        }
    }


    async createOnboardingLink(accountId: string, returnUrl: string): Promise<string> {
        try {
            const link = await this.requireClient().accountLinks.create({ account: accountId, refresh_url: returnUrl, return_url: returnUrl, type: "account_onboarding" });
            return link.url;
        } catch (error) {
            this.logger.warn("Stripe rejected account-link creation");
            throw new ConnectProviderError("account_link", error);
        }
    }

    async retrieveAccount(accountId: string): Promise<ConnectAccountSnapshot> {
        try {
            const account = await this.requireClient().accounts.retrieve(accountId);
            const chargesEnabled = Boolean(account.charges_enabled);
            const payoutsEnabled = Boolean(account.payouts_enabled);
            const detailsSubmitted = Boolean(account.details_submitted);
            return {
                id: account.id,
                chargesEnabled,
                payoutsEnabled,
                detailsSubmitted,
            };
        } catch (error) {
            this.logger.warn(`Stripe connected-account retrieval failed for ${accountId}`);
            throw new ConnectProviderError("account_retrieve", error);
        }
    }

    private requireClient(): Stripe {
        if (!this.stripe) throw new ConnectProviderError("provider_unavailable");
        return this.stripe;
    }
}
