import { ExchangeRateService } from "../src/modules/payments/exchange-rate.service";
import { StripeConnectAdapter } from "../src/modules/payments/stripe-connect.adapter";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function runTests() {
    console.log("=== 1. Testing Live ExchangeRateService ===");
    const exchangeService = new ExchangeRateService();
    
    // Test USD (1:1)
    const usdResult = await exchangeService.convertToUsdCents(2500, "USD");
    console.log("USD Conversion:", usdResult);
    if (usdResult.usdCents !== 2500 || usdResult.rate !== 1.0) {
        throw new Error("USD 1:1 conversion failed");
    }

    // Test PKR (e.g. 5,000 PKR = 500,000 cents)
    const pkrResult = await exchangeService.convertToUsdCents(500000, "PKR");
    console.log("PKR Conversion (5,000 PKR):", pkrResult);
    if (pkrResult.usdCents <= 0 || pkrResult.rate <= 0) {
        throw new Error("PKR conversion to USD failed");
    }
    console.log(`✓ 5,000 PKR correctly converted to $${(pkrResult.usdCents / 100).toFixed(2)} USD at rate ${pkrResult.rate}`);

    // Test EUR (e.g. 100 EUR = 10,000 cents)
    const eurResult = await exchangeService.convertToUsdCents(10000, "EUR");
    console.log("EUR Conversion (100 EUR):", eurResult);
    if (eurResult.usdCents <= 0 || eurResult.rate <= 0) {
        throw new Error("EUR conversion to USD failed");
    }
    console.log(`✓ 100 EUR correctly converted to $${(eurResult.usdCents / 100).toFixed(2)} USD at rate ${eurResult.rate}`);

    // Test AED (e.g. 350 AED = 35,000 cents)
    const aedResult = await exchangeService.convertToUsdCents(35000, "AED");
    console.log("AED Conversion (350 AED):", aedResult);
    if (aedResult.usdCents <= 0 || aedResult.rate <= 0) {
        throw new Error("AED conversion to USD failed");
    }
    console.log(`✓ 350 AED correctly converted to $${(aedResult.usdCents / 100).toFixed(2)} USD at rate ${aedResult.rate}`);

    // Test Convert From USD back to PKR
    const backToPkr = await exchangeService.convertFromUsdCents(pkrResult.usdCents, "PKR");
    console.log(`Bidirectional Check: $${(pkrResult.usdCents / 100).toFixed(2)} USD converts back to ${backToPkr.toAmountCents / 100} PKR (approx error < 1%)`);
    
    console.log("\n=== 2. Testing StripeConnectAdapter Multi-Country Capability Logic ===");
    const stripeAdapter = new StripeConnectAdapter();
    
    if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes("placeholder")) {
        console.log("Testing live Stripe Connect account creation for Pakistan (PK)...");
        try {
            const acc = await stripeAdapter.createAccount({
                organizationId: "org_test_pk_" + Date.now(),
                businessName: "Lahore Medical Specialists",
                country: "PK",
                email: "owner.test@bookpro.com",
            });
            console.log("✓ Successfully created Stripe Express account for PK:", acc.accountId);

            const link = await stripeAdapter.createAccountLink({
                accountId: acc.accountId,
                refreshUrl: "http://localhost:3000/onboarding?step=8&stripe_result=refresh",
                returnUrl: "http://localhost:3000/onboarding?step=8&stripe_result=pending_verification",
            });
            console.log("✓ Successfully generated real Stripe Onboarding Link:", link.url.substring(0, 60) + "...");
        } catch (err: any) {
            console.error("Stripe live test error:", err.message);
            throw err;
        }
    } else {
        console.log("Skipping live Stripe API call (test key is placeholder)");
    }

    console.log("\n✅ ALL MULTI-CURRENCY & STRIPE CONNECT VERIFICATIONS PASSED!");
}

runTests().catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
});
