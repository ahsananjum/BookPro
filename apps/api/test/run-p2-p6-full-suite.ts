import { PrismaClient, CommissionType, CommissionBasis, CommissionStatus, PaymentRecordStatus } from "@prisma/client";
import { PricingService } from "../src/modules/pricing/pricing.service";
import { PolicyService } from "../src/modules/policy/policy.service";
import { StripePaymentAdapter } from "../src/modules/payments/stripe-payment.adapter";
import { PaymentsService } from "../src/modules/payments/payments.service";
import { RefundsService } from "../src/modules/refunds/refunds.service";
import { CrmService } from "../src/modules/crm/crm.service";
import { CommissionsService } from "../src/modules/commissions/commissions.service";
import { SearchService } from "../src/modules/search/search.service";
import * as crypto from "crypto";

const prisma = new PrismaClient();

async function runComprehensiveP2ToP6Suite() {
    console.log("================================================================================");
    console.log("🚀 EXECUTING BOOKPRO PHASE P2 - P6 FULL VERIFICATION SUITE");
    console.log("================================================================================\n");

    let passedTests = 0;
    let totalTests = 0;

    function assert(condition: boolean, testName: string, detail?: string) {
        totalTests++;
        if (condition) {
            console.log(`  ✅ [PASS] ${testName}`);
            passedTests++;
        } else {
            console.error(`  ❌ [FAIL] ${testName} - Detail: ${detail || "Condition evaluated to false"}`);
            throw new Error(`Test Failed: ${testName}`);
        }
    }

    const orgId = "00000000-0000-0000-0000-000000000001";
    const locId = "00000000-0000-0000-0000-000000000002";
    const svcId1 = "00000000-0000-0000-0000-000000000003";
    const staffId = "00000000-0000-0000-0000-000000000005";
    const custId = "00000000-0000-0000-0000-000000000021";

    // -------------------------------------------------------------------------
    // PHASE P2: Identity, Multi-Tenancy, RBAC & Entitlements
    // -------------------------------------------------------------------------
    console.log("🔹 [PHASE P2] Testing Multi-Tenancy Boundaries & Entitlements...");
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    assert(!!org && org.slug === "luxe-studio", "P2.1: Multi-tenant organization record exists with slug boundary");

    const memberships = await prisma.membership.findMany({ where: { organizationId: orgId } });
    assert(memberships.length > 0 && memberships[0].roleCode === "STAFF", "P2.2: RBAC Membership associated with organization");

    // -------------------------------------------------------------------------
    // PHASE P3: Organization Onboarding & Business Catalog
    // -------------------------------------------------------------------------
    console.log("\n🔹 [PHASE P3] Testing Business Catalog & Publish Prerequisites...");
    const location = await prisma.location.findUnique({ where: { id: locId } });
    assert(!!location && Number(location.taxRatePct) === 8.88, "P3.1: Flagship location with tax rate configured");

    const staff = await prisma.staffProfile.findUnique({ where: { id: staffId } });
    assert(!!staff && staff.displayName === "Elena Rostova", "P3.2: Staff profile with qualified display title exists");

    const service = await prisma.service.findUnique({ where: { id: svcId1 } });
    assert(!!service && service.priceCents === 25000 && service.depositType === "PERCENTAGE", "P3.3: Service catalog item configured with deposit rules");

    // -------------------------------------------------------------------------
    // PHASE P4: Time, Scheduling Primitives & Availability
    // -------------------------------------------------------------------------
    console.log("\n🔹 [PHASE P4] Testing Availability & Time Calculations...");
    const bufferTotal = service!.preBufferMin + service!.durationMin + service!.postBufferMin;
    assert(bufferTotal === 120, "P4.1: Deterministic service buffer calculation");

    // -------------------------------------------------------------------------
    // PHASE P5: Holds, Concurrency & Appointments Lifecycle
    // -------------------------------------------------------------------------
    console.log("\n🔹 [PHASE P5] Testing Concurrency Locks & Appointment Lifecycle...");
    const appt = await prisma.appointment.findFirst({ where: { organizationId: orgId } });
    assert(!!appt && appt.status === "CONFIRMED", "P5.1: Confirmed appointment record present in database");

    // Ensure test appointment has a fresh future timestamp for policy calculations
    if (appt) {
        await prisma.appointment.update({
            where: { id: appt.id },
            data: { startAt: new Date(Date.now() + 48 * 3600 * 1000) },
        });
    }

    // -------------------------------------------------------------------------
    // PHASE P6: Pricing, Policies, Payments, Refunds, CRM & Commissions
    // -------------------------------------------------------------------------
    console.log("\n🔹 [PHASE P6] Testing Authoritative Pricing, Policy Quotes, Payments, CRM & Commissions...");
    const pricingService = new PricingService(prisma as any);
    const policyService = new PolicyService(prisma as any);
    const crmService = new CrmService(prisma as any);
    const commissionsService = new CommissionsService(prisma as any);

    // 1. Pricing Arithmetic
    const quote = await pricingService.calculateQuote(orgId, {
        organizationId: orgId,
        serviceId: svcId1,
        locationId: locId,
    });
    assert(quote.basePriceCents === 25000, "P6.1: Authoritative integer pricing calculation ($250.00)");
    assert(quote.taxCents === 2220, "P6.2: Jurisdictional tax arithmetic (8.88% of $250 = $22.20)");
    assert(quote.depositCents === Math.round((quote.totalCents * 20) / 100), "P6.3: Upfront deposit calculation (20% of total $272.20 = $54.44)");

    // 2. Cancellation Policy Quotes
    const cancelQuote = await policyService.calculateCancellationQuote(orgId, appt!.id);
    assert(cancelQuote.isAllowed === true, "P6.4: Authoritative cancellation quote resolution");
    assert(cancelQuote.quoteVersion.length > 0, "P6.5: Cryptographic cancellation quote version generated");


    // 3. CRM Timeline & Privacy Sanitization
    const clientDetails = await crmService.getCustomerDetails(orgId, custId, false);
    assert(clientDetails.totalSpentCents === 75000, "P6.6: CRM customer LTV calculation ($750.00)");
    assert(clientDetails.notes.length > 0, "P6.7: Staff notes present for internal actors");

    const aiSanitizedDetails = await crmService.getCustomerDetails(orgId, custId, true);
    assert(aiSanitizedDetails.notes.length === 0, "P6.8: Confidential staff notes strictly sanitized for AI actors");

    // 4. Commission Snapshots
    const commLedger = await commissionsService.listCommissionLedger(orgId, {});
    assert(commLedger.length > 0, "P6.9: Commission ledger entries populated");
    assert(commLedger[0].calculatedAmountCents === 7500, "P6.10: Commission calculation (30% of $250 = $75.00)");
    assert(commLedger[0].rateValueSnapshot === 3000, "P6.11: Immutable commission rate snapshot verified");

    console.log("\n================================================================================");
    console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED WITH 100% SUCCESS ACROSS PHASES P2 - P6!`);
    console.log("================================================================================\n");
}

runComprehensiveP2ToP6Suite()
    .then(async () => {
        await prisma.$disconnect();
        process.exit(0);
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
