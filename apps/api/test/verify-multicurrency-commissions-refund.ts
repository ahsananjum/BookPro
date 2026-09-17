import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { PrismaService } from "../src/modules/database/prisma.service";
import { ExchangeRateService } from "../src/modules/payments/exchange-rate.service";
import { PaymentsService } from "../src/modules/payments/payments.service";
import { CommissionsService } from "../src/modules/commissions/commissions.service";
import { StripePaymentAdapter } from "../src/modules/payments/stripe-payment.adapter";

async function runMulticurrencyVerification() {
    console.log("================================================================================");
    console.log("   MULTICURRENCY CONVERSION & STRIPE CONNECT REFUND VERIFICATION");
    console.log("================================================================================\n");

    const prisma = new PrismaService();
    await prisma.onModuleInit();

    const exchangeRateService = new ExchangeRateService();
    const paymentsService = new PaymentsService(
        prisma,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        exchangeRateService
    );
    const commissionsService = new CommissionsService(prisma, undefined, exchangeRateService);

    let failed = false;

    try {
        // 1. ExchangeRateService.convertCurrency tests
        console.log("--- TEST 1: ExchangeRateService Arbitrary Currency Pairs ---");
        const conv1 = await exchangeRateService.convertCurrency(10000, "USD", "EUR");
        console.log(`100 USD (10000 cents) -> EUR: ${conv1.convertedAmountCents} cents (rate: ${conv1.rate})`);
        if (conv1.convertedAmountCents <= 0 || conv1.rate <= 0) {
            throw new Error("USD -> EUR conversion returned invalid result");
        }

        const conv2 = await exchangeRateService.convertCurrency(43500, "PKR", "USD");
        console.log(`435 PKR (43500 cents) -> USD: ${conv2.convertedAmountCents} cents (rate: ${conv2.rate})`);
        if (conv2.convertedAmountCents <= 0 || conv2.rate <= 0) {
            throw new Error("PKR -> USD conversion returned invalid result");
        }

        const conv3 = await exchangeRateService.convertCurrency(157, "USD", "PKR");
        console.log(`1.57 USD (157 cents) -> PKR: ${conv3.convertedAmountCents} cents (rate: ${conv3.rate})`);
        if (conv3.convertedAmountCents <= 0) {
            throw new Error("USD -> PKR conversion returned invalid result");
        }
        console.log("✓ PASS: ExchangeRateService conversion working accurately across currency pairs.\n");

        // 2. Organization 'testies' Payments Summary verification
        console.log("--- TEST 2: Payments Summary Organization Currency Normalization ---");
        const orgId = "e539f256-1988-416c-aa93-e39154515a00"; // 'testies' org with PKR currency
        const org = await prisma.organization.findUnique({ where: { id: orgId } });
        if (!org) {
            throw new Error(`Organization ${orgId} not found in database`);
        }
        console.log(`Target Org: "${org.name}", Currency: ${org.currency}, StripeAccount: ${org.stripeAccountId}`);

        const summary = await paymentsService.getPaymentsSummary(orgId);
        console.log("Payments Summary Output:", summary);

        if (summary.currency !== org.currency) {
            throw new Error(`Summary currency ${summary.currency} does not match org currency ${org.currency}`);
        }
        // In the database, the payment was 157 USD cents with originalAmountCents: 43500 PKR
        // Gross revenue should be 43500 cents (Rs 435.00), NOT 157 cents (Rs 1.57)!
        if (summary.grossRevenueCents < 40000) {
            throw new Error(`Summary grossRevenueCents is ${summary.grossRevenueCents}, expected converted amount >= 40000 cents (Rs 400+)`);
        }
        console.log(`✓ PASS: Payments summary gross revenue is converted to ${summary.currency} (${summary.grossRevenueCents / 100} ${summary.currency}), net: ${summary.netRevenueCents / 100} ${summary.currency}.\n`);

        // 3. Payments List Items verification
        console.log("--- TEST 3: List Payments Converted Fields ---");
        const paymentsList = await paymentsService.listPayments(orgId, { limit: 10, offset: 0 });
        console.log(`Retrieved ${paymentsList.items.length} payment records`);
        if (paymentsList.items.length > 0) {
            const firstItem = paymentsList.items[0];
            console.log("First Payment Record:", {
                id: firstItem.id,
                rawAmountCents: firstItem.amountCents,
                currency: firstItem.currency,
                convertedAmountCents: firstItem.convertedAmountCents,
                convertedCurrency: firstItem.convertedCurrency,
                totalRefundedConvertedCents: firstItem.totalRefundedConvertedCents,
            });

            if (!firstItem.convertedCurrency || firstItem.convertedCurrency !== org.currency) {
                throw new Error(`Expected convertedCurrency to be ${org.currency}, got ${firstItem.convertedCurrency}`);
            }
            if (firstItem.currency !== org.currency && firstItem.convertedAmountCents === firstItem.amountCents) {
                throw new Error(`convertedAmountCents (${firstItem.convertedAmountCents}) equals raw amountCents (${firstItem.amountCents}) when currencies differ!`);
            }
            console.log(`✓ PASS: List payments includes convertedAmountCents (${firstItem.convertedAmountCents}) in ${firstItem.convertedCurrency}.\n`);
        }

        // 4. Commissions Summary & Ledger verification
        console.log("--- TEST 4: Commissions Summary & Ledger Currency Normalization ---");
        const commSummary = await commissionsService.getCommissionSummary(orgId);
        console.log("Commissions Summary:", commSummary);
        if (commSummary.currency !== org.currency) {
            throw new Error(`Commissions summary currency ${commSummary.currency} does not match org currency ${org.currency}`);
        }

        const commLedger = await commissionsService.listCommissionLedger(orgId, {});
        console.log(`Commission Ledger Count: ${commLedger.length}`);
        if (commLedger.length > 0) {
            const firstComm = commLedger[0];
            console.log("First Commission Record:", {
                id: firstComm.id,
                calculatedAmountCents: firstComm.calculatedAmountCents,
                convertedAmountCents: (firstComm as any).convertedAmountCents,
                convertedCurrency: (firstComm as any).convertedCurrency,
            });
            if ((firstComm as any).convertedCurrency !== org.currency) {
                throw new Error(`Commission record convertedCurrency should be ${org.currency}`);
            }
        }
        console.log("✓ PASS: Commissions summary and ledger properly reflect organization currency.\n");

        // 5. Stripe Connect Refund Workflow inspection
        console.log("--- TEST 5: StripePaymentAdapter Refund Direct & Destination Payload Verification ---");
        const stripeAdapter = new StripePaymentAdapter();
        const mockStripe = (stripeAdapter as any).stripe;

        let capturedRefundPayload: any = null;
        let capturedRefundOptions: any = null;

        // Mock refunds.create
        mockStripe.refunds.create = async (payload: any, options?: any) => {
            capturedRefundPayload = payload;
            capturedRefundOptions = options;
            return {
                id: "re_mock_test_123",
                status: "succeeded",
                amount: payload.amount,
                currency: "usd",
            };
        };

        // Case A: Destination Charge refund (reverse_transfer: true, refund_application_fee: true)
        console.log("Testing Case A: Destination Charge Refund...");
        const resA = await stripeAdapter.refund({
            providerPaymentId: "pi_test_dest_123",
            amountCents: 157,
            currency: "USD",
            connectedAccountId: "acct_1UAeFsGizyfMY8WR",
            chargePattern: "DESTINATION",
            reason: "Customer requested cancellation",
            idempotencyKey: "idem_test_a",
        });

        console.log("Destination refund captured params:", capturedRefundPayload);
        if (capturedRefundPayload.reverse_transfer !== true) {
            throw new Error("Expected reverse_transfer: true on destination charge refund");
        }
        if (capturedRefundPayload.refund_application_fee !== true) {
            throw new Error("Expected refund_application_fee: true on destination charge refund");
        }
        console.log("✓ PASS: Destination charge refund accurately reverses transfer from connected Stripe account.\n");

        // Case B: Direct Charge refund (request options { stripeAccount: connectedAccountId })
        console.log("Testing Case B: Direct Charge Refund...");
        const resB = await stripeAdapter.refund({
            providerPaymentId: "pi_test_direct_456",
            amountCents: 2500,
            currency: "USD",
            connectedAccountId: "acct_1UAeFsGizyfMY8WR",
            chargePattern: "DIRECT",
            reason: "Customer requested cancellation",
            idempotencyKey: "idem_test_b",
        });

        console.log("Direct refund captured options:", capturedRefundOptions);
        if (!capturedRefundOptions || capturedRefundOptions.stripeAccount !== "acct_1UAeFsGizyfMY8WR") {
            throw new Error("Expected stripeAccount option on direct charge refund");
        }
        console.log("✓ PASS: Direct charge refund accurately passes stripeAccount option to debit connected Stripe account.\n");

        console.log("================================================================================");
        console.log("   ALL MULTICURRENCY & STRIPE CONNECT REFUND CHECKS PASSED SUCCESSFULLY!");
        console.log("================================================================================");
    } catch (err: any) {
        console.error("❌ VERIFICATION FAILURE:", err.message);
        console.error(err.stack);
        failed = true;
    } finally {
        await prisma.$disconnect();
        process.exit(failed ? 1 : 0);
    }
}

runMulticurrencyVerification();
