export const STRIPE_CONNECT_PROVIDER = "STRIPE_CONNECT_PROVIDER";

export interface ConnectAccountSnapshot {
    id: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
}

export interface CreateConnectAccountInput {
    country: string;
    email?: string;
    businessName: string;
    organizationId: string;
}

export interface StripeConnectProvider {
    isConfigured(): boolean;
    usesOAuth(): boolean;
    buildOAuthUrl(state: string): string;
    exchangeOAuthCode(code: string): Promise<string>;
    createAccount(input: CreateConnectAccountInput): Promise<string>;
    createOnboardingLink(accountId: string, returnUrl: string): Promise<string>;
    retrieveAccount(accountId: string): Promise<ConnectAccountSnapshot>;
}

export class ConnectProviderError extends Error {
    constructor(public readonly operation: string, cause?: unknown) {
        super(`Stripe Connect provider operation failed: ${operation}`);
        this.name = "ConnectProviderError";
        if (cause) (this as Error & { cause?: unknown }).cause = cause;
    }
}
