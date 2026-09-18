const dotenv = require("dotenv");
dotenv.config({ path: "C:/BookPro/.env" });
const StripeSDK = require("stripe");

async function createStripeConnectAccount(stripe: any, input: { country: string; email?: string; businessName?: string; organizationId: string }) {
    const country = input.country.toUpperCase();
    try {
        console.log(`[Attempt 1] Creating standard full-capability Express account for ${country}...`);
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
        console.log(`[Attempt 1 Failed] for ${country}: ${msg}`);

        if (
            msg.includes("card_payments") ||
            msg.includes("service agreement") ||
            msg.includes("recipient") ||
            param === "requested_capabilities" ||
            param === "tos_acceptance"
        ) {
            console.log(`[Attempt 2] Fallback to recipient cross-border Express account for ${country}...`);
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
        }
        throw error;
    }
}

async function main() {
    const StripeCtor = typeof StripeSDK === "function" ? StripeSDK : (StripeSDK.default || StripeSDK);
    const stripe = new StripeCtor(process.env.STRIPE_SECRET_KEY!);

    // Test PK
    try {
        const pkId = await createStripeConnectAccount(stripe, {
            country: "PK",
            email: "ahsananjum149@gmail.com",
            businessName: "testies",
            organizationId: "e539f256-1988-416c-aa93-e39154515a00",
        });
        console.log("PK Account created successfully:", pkId);
        const link = await stripe.accountLinks.create({
            account: pkId,
            refresh_url: "http://localhost:3000/onboarding?step=8",
            return_url: "http://localhost:3000/onboarding?step=8",
            type: "account_onboarding",
        });
        console.log("PK Onboarding Link generated successfully:", link.url);
    } catch (e: any) {
        console.error("PK Error:", e.message);
    }

    // Test US
    try {
        const usId = await createStripeConnectAccount(stripe, {
            country: "US",
            email: "spa@example.com",
            businessName: "spa",
            organizationId: "0e2893ef-6c82-449a-a59c-76d84a3afa5d",
        });
        console.log("US Account created successfully:", usId);
        const link = await stripe.accountLinks.create({
            account: usId,
            refresh_url: "http://localhost:3000/onboarding?step=8",
            return_url: "http://localhost:3000/onboarding?step=8",
            type: "account_onboarding",
        });
        console.log("US Onboarding Link generated successfully:", link.url);
    } catch (e: any) {
        console.error("US Error:", e.message);
    }
}

main();
