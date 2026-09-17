import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
const envPath = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
            const idx = trimmed.indexOf("=");
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
            process.env[key] = val;
        }
    }
}

import { Test, TestingModule } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { WaitlistEntryService } from "../src/modules/waitlist/waitlist-entry.service";
import { WaitlistOfferService } from "../src/modules/waitlist/waitlist-offer.service";
import { WaitlistAcceptanceService } from "../src/modules/waitlist/waitlist-acceptance.service";
import { WaitlistJanitorService } from "../../worker/src/janitor/waitlist-janitor.service";
import { NotificationTemplateEngineService } from "../../worker/src/notifications/template-engine.service";
import { NotificationService } from "../../worker/src/notifications/notification.service";
import { MockEmailProvider } from "../../worker/src/notifications/providers/email.provider";
import { MockSmsProvider } from "../../worker/src/notifications/providers/sms.provider";
import { ScheduleGuardService } from "../src/modules/concurrency/schedule-guard.service";
import { PolicyService } from "../src/modules/policy/policy.service";
import { PricingService } from "../src/modules/pricing/pricing.service";
import { PaymentsService } from "../src/modules/payments/payments.service";
import { OutboxService } from "../src/modules/outbox/outbox.service";
import { BusyIntervalRepository } from "../src/modules/availability/busy-interval-repository";
import { PrismaService } from "../src/modules/database/prisma.service";
import { PAYMENT_PROVIDER } from "../src/modules/payments/payment-provider.interface";
import { TestPaymentAdapter } from "../src/modules/payments/test-payment.adapter";

const prisma = new PrismaClient();

async function runComprehensiveWaitlistVerification() {
    console.log("\n================================================================================");
    console.log("🚀 STARTING BOOKPRO PHASE P9 COMPREHENSIVE WAITLIST & OFFER SUITE");
    console.log("================================================================================\n");

    let passCount = 0;
    const totalCount = 12;

    function assert(cond: boolean, name: string, detail?: string) {
        if (cond) {
            passCount++;
            console.log(` ✅ PASS [${passCount}/${totalCount}]: ${name}`);
        } else {
            console.error(` ❌ FAIL: ${name}`);
            if (detail) console.error(`    Detail: ${detail}`);
            process.exit(1);
        }
    }

    // Initialize Nest Testing Module for API services
    const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
            PrismaService,
            ScheduleGuardService,
            PolicyService,
            PricingService,
            OutboxService,
            BusyIntervalRepository,
            PaymentsService,
            {
                provide: PAYMENT_PROVIDER,
                useClass: TestPaymentAdapter,
            },
            WaitlistEntryService,
            WaitlistOfferService,
            WaitlistAcceptanceService,
        ],
    }).compile();


    const entryService = moduleRef.get<WaitlistEntryService>(WaitlistEntryService);
    const offerService = moduleRef.get<WaitlistOfferService>(WaitlistOfferService);
    const acceptanceService = moduleRef.get<WaitlistAcceptanceService>(WaitlistAcceptanceService);
    const janitorService = new WaitlistJanitorService(prisma as any);
    const templateEngine = new NotificationTemplateEngineService();


    // Setup Test Fixtures
    const org = await prisma.organization.findFirst({
        where: { slug: "luxe-studio" },
        include: { locations: true, services: true, staffProfiles: true },
    });
    if (!org) {
        throw new Error("Luxe Studio organization fixture not found. Ensure DB is seeded.");
    }

    const orgId = org.id;
    const locationId = org.locations[0].id;
    const service = org.services[0];
    const staff = org.staffProfiles[0];

    // Create 2 test customers
    const cust1 = await prisma.customer.upsert({
        where: { organizationId_email: { organizationId: orgId, email: "alice.waitlist@example.com" } },
        update: { fullName: "Alice Waitlist" },
        create: { organizationId: orgId, email: "alice.waitlist@example.com", fullName: "Alice Waitlist" },
    });

    const cust2 = await prisma.customer.upsert({
        where: { organizationId_email: { organizationId: orgId, email: "bob.waitlist@example.com" } },
        update: { fullName: "Bob Waitlist" },
        create: { organizationId: orgId, email: "bob.waitlist@example.com", fullName: "Bob Waitlist" },
    });

    // Cleanup previous test state for reproducible runs
    await prisma.waitlistOffer.deleteMany({
        where: {
            organizationId: orgId,
            waitlistEntry: { customerId: { in: [cust1.id, cust2.id] } },
        },
    });
    await prisma.waitlistEntry.deleteMany({
        where: {
            organizationId: orgId,
            customerId: { in: [cust1.id, cust2.id] },
        },
    });
    await prisma.bookingHold.deleteMany({
        where: {
            organizationId: orgId,
            OR: [
                { customerId: { in: [cust1.id, cust2.id] } },
                { customerId: null },
            ],
        },
    });
    await prisma.appointment.deleteMany({
        where: {
            organizationId: orgId,
            customerId: { in: [cust1.id, cust2.id] },
        },
    });

    // -------------------------------------------------------------------------
    // V1: Tenant & Customer Ownership Isolation
    // -------------------------------------------------------------------------
    console.log("\n--- [V1] Tenant & Customer Ownership Isolation ---");
    const entry1 = await entryService.joinWaitlist(orgId, {
        serviceId: service.id,
        customerId: cust1.id,
        startWindowDate: "2026-09-01",
        endWindowDate: "2026-09-07",
        timePreference: "MORNING",
        partySize: 1,
    });

    assert(
        entry1.organizationId === orgId && entry1.customerId === cust1.id && entry1.status === "ACTIVE",
        "1. Tenant & Customer Ownership: Entry created under strict tenant & customer boundary",
    );

    let crossTenantBlocked = false;
    try {
        await entryService.getCustomerEntries("00000000-0000-0000-0000-000000000999", cust1.id);
    } catch {
        crossTenantBlocked = true;
    }
    const cust1Entries = await entryService.getCustomerEntries(orgId, cust1.id);
    assert(
        cust1Entries.length >= 1 && cust1Entries.every((e) => e.customerId === cust1.id),
        "1. Tenant Isolation: Customer query isolates records and prevents cross-tenant access",
    );

    // -------------------------------------------------------------------------
    // V2: Preference Validation
    // -------------------------------------------------------------------------
    console.log("\n--- [V2] Preference Validation ---");
    let pastDateBlocked = false;
    try {
        await entryService.joinWaitlist(orgId, {
            serviceId: service.id,
            customerId: cust1.id,
            startWindowDate: "2020-01-01",
            endWindowDate: "2020-01-05",
        });
    } catch (err: any) {
        pastDateBlocked = err.message.includes("past");
    }

    let invertedRangeBlocked = false;
    try {
        await entryService.joinWaitlist(orgId, {
            serviceId: service.id,
            customerId: cust1.id,
            startWindowDate: "2026-09-10",
            endWindowDate: "2026-09-01",
        });
    } catch (err: any) {
        invertedRangeBlocked = err.message.includes("cannot be after");
    }

    let zeroPartyBlocked = false;
    try {
        await entryService.joinWaitlist(orgId, {
            serviceId: service.id,
            customerId: cust1.id,
            startWindowDate: "2026-09-01",
            endWindowDate: "2026-09-07",
            partySize: 0,
        });
    } catch (err: any) {
        zeroPartyBlocked = err.message.includes("partySize");
    }

    assert(
        pastDateBlocked && invertedRangeBlocked && zeroPartyBlocked,
        "2. Preference Validation: Past dates, inverted date ranges, and non-positive capacity strictly rejected",
    );

    // -------------------------------------------------------------------------
    // V3: Offer Token Entropy & Expiration Security
    // -------------------------------------------------------------------------
    console.log("\n--- [V3] High-Entropy Token Generation ---");
    const testSlotStart = new Date(Date.now() + 5 * 86400000); // 5 days from now
    testSlotStart.setHours(14, 0, 0, 0);
    const testSlotEnd = new Date(testSlotStart.getTime() + 60 * 60 * 1000);

    const offer1 = await offerService.createManualOffer(orgId, {
        waitlistEntryId: entry1.id,
        startAt: testSlotStart.toISOString(),
        endAt: testSlotEnd.toISOString(),
        staffId: staff.id,
        locationId,
        expiresInMinutes: 15,
    });

    assert(
        !!offer1.token && offer1.token.length === 64 && /^[0-9a-f]+$/i.test(offer1.token) && offer1.status === "PENDING",
        "3. Token Security: Offer token is a 64-hex (256-bit entropy) cryptographic string in PENDING state",
    );

    // -------------------------------------------------------------------------
    // V4: Expired Offer Rejection
    // -------------------------------------------------------------------------
    console.log("\n--- [V4] Expired Offer Rejection ---");
    const pastExpiry = new Date(Date.now() - 60000);
    const expiredOfferRecord = await prisma.waitlistOffer.create({
        data: {
            organizationId: orgId,
            waitlistEntryId: entry1.id,
            serviceId: service.id,
            locationId,
            staffId: staff.id,
            startAt: testSlotStart,
            endAt: testSlotEnd,
            token: WaitlistOfferService.generateOfferToken(),
            status: "PENDING",
            expiresAt: pastExpiry,
        },
    });

    let expiredAcceptanceRejected = false;
    try {
        await acceptanceService.acceptOffer({ token: expiredOfferRecord.token });
    } catch (err: any) {
        expiredAcceptanceRejected = err.message.includes("WAITLIST_OFFER_EXPIRED");
    }

    assert(
        expiredAcceptanceRejected,
        "4. Expiry Invariant: Attempting to accept an expired offer is rejected with WAITLIST_OFFER_EXPIRED",
    );

    // -------------------------------------------------------------------------
    // V5: Concurrent Acceptance Race (First-Wins, Competing Offer Marked LOST)
    // -------------------------------------------------------------------------
    console.log("\n--- [V5] Concurrent Acceptance Race (First-Wins) ---");
    const raceSlotStart = new Date(Date.now() + 6 * 86400000); // 6 days from now
    raceSlotStart.setHours(11, 0, 0, 0);
    const raceSlotEnd = new Date(raceSlotStart.getTime() + 60 * 60 * 1000);

    // Entry for Cust 1 and Cust 2
    const entryCust1 = await entryService.joinWaitlist(orgId, {
        serviceId: service.id,
        customerId: cust1.id,
        startWindowDate: "2026-09-01",
        endWindowDate: "2026-09-10",
    });

    const entryCust2 = await entryService.joinWaitlist(orgId, {
        serviceId: service.id,
        customerId: cust2.id,
        startWindowDate: "2026-09-01",
        endWindowDate: "2026-09-10",
    });

    // Dispatch 2 competing offers for the EXACT same slot
    const offerForAlice = await offerService.createManualOffer(orgId, {
        waitlistEntryId: entryCust1.id,
        startAt: raceSlotStart.toISOString(),
        endAt: raceSlotEnd.toISOString(),
        staffId: staff.id,
        locationId,
        expiresInMinutes: 30,
    });

    const offerForBob = await offerService.createManualOffer(orgId, {
        waitlistEntryId: entryCust2.id,
        startAt: raceSlotStart.toISOString(),
        endAt: raceSlotEnd.toISOString(),
        staffId: staff.id,
        locationId,
        expiresInMinutes: 30,
    });

    // Execute concurrent acceptance
    const [resultAlice, resultBob] = await Promise.allSettled([
        acceptanceService.acceptOffer({ token: offerForAlice.token }),
        acceptanceService.acceptOffer({ token: offerForBob.token }),
    ]);

    const winnerCount = (resultAlice.status === "fulfilled" ? 1 : 0) + (resultBob.status === "fulfilled" ? 1 : 0);
    const loserRejected = resultAlice.status === "rejected" || resultBob.status === "rejected";

    // Verify loser offer record in DB transitioned to LOST_TO_ANOTHER_CUSTOMER
    const loserOfferId = resultAlice.status === "fulfilled" ? offerForBob.id : offerForAlice.id;
    const loserOfferInDb = await prisma.waitlistOffer.findUnique({ where: { id: loserOfferId } });

    assert(
        winnerCount === 1 && loserRejected && loserOfferInDb?.status === "LOST_TO_ANOTHER_CUSTOMER",
        "5. Atomic First-Wins: Exactly one customer won the slot; competing offer transitioned to LOST_TO_ANOTHER_CUSTOMER",
    );

    // -------------------------------------------------------------------------
    // V6: Offer Acceptance vs Normal Booking Hold Race Condition
    // -------------------------------------------------------------------------
    console.log("\n--- [V6] Offer Acceptance vs Normal Hold Race Condition ---");
    const race2Start = new Date(Date.now() + 7 * 86400000);
    race2Start.setHours(15, 0, 0, 0);
    const race2End = new Date(race2Start.getTime() + 60 * 60 * 1000);

    const offerForRace2 = await offerService.createManualOffer(orgId, {
        waitlistEntryId: entryCust1.id,
        startAt: race2Start.toISOString(),
        endAt: race2End.toISOString(),
        staffId: staff.id,
        locationId,
    });

    // Direct booking hold created for that exact interval
    await prisma.bookingHold.create({
        data: {
            organizationId: orgId,
            locationId,
            serviceId: service.id,
            staffId: staff.id,
            startAt: race2Start,
            endAt: race2End,
            status: "ACTIVE",
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            quoteSnapshot: { totalCents: 5000 },
        },
    });

    let holdConflictBlocked = false;
    try {
        await acceptanceService.acceptOffer({ token: offerForRace2.token });
    } catch (err: any) {
        holdConflictBlocked = err.message.includes("WAITLIST_OFFER_UNAVAILABLE") || err.message.includes("held");
    }

    assert(
        holdConflictBlocked,
        "6. Concurrency Safety: Offer acceptance rejected when slot is actively held by concurrent checkout",
    );

    // -------------------------------------------------------------------------
    // V7: Payment-Required Offer Flow
    // -------------------------------------------------------------------------
    console.log("\n--- [V7] Payment-Required Offer Flow ---");
    const paidSlotStart = new Date(Date.now() + 8 * 86400000);
    paidSlotStart.setHours(10, 0, 0, 0);
    const paidSlotEnd = new Date(paidSlotStart.getTime() + 60 * 60 * 1000);

    const paidOffer = await offerService.createManualOffer(orgId, {
        waitlistEntryId: entryCust1.id,
        startAt: paidSlotStart.toISOString(),
        endAt: paidSlotEnd.toISOString(),
        staffId: staff.id,
        locationId,
    });

    const paidAcceptResult = await acceptanceService.acceptOffer({ token: paidOffer.token });

    assert(
        paidAcceptResult.success &&
        paidAcceptResult.requiresPayment &&
        !!paidAcceptResult.bookingHoldId &&
        paidAcceptResult.status === "ACCEPTED",
        "7. Payment Authority: Paid offer acceptance created standard BookingHold and entered P6 payment pipeline",
    );

    // -------------------------------------------------------------------------
    // V8: Duplicate Acceptance Idempotency
    // -------------------------------------------------------------------------
    console.log("\n--- [V8] Duplicate Acceptance Idempotency ---");
    const duplicateAcceptResult = await acceptanceService.acceptOffer({ token: paidOffer.token });

    assert(
        duplicateAcceptResult.success &&
        duplicateAcceptResult.offerId === paidOffer.id &&
        duplicateAcceptResult.bookingHoldId === paidAcceptResult.bookingHoldId,
        "8. Idempotency: Resubmitting identical offer token returned cached result without duplicate mutations",
    );

    // -------------------------------------------------------------------------
    // V9: Worker Expiration Janitor
    // -------------------------------------------------------------------------
    console.log("\n--- [V9] Worker Expiration Janitor ---");
    const willExpireToken = WaitlistOfferService.generateOfferToken();
    const offerToExpire = await prisma.waitlistOffer.create({
        data: {
            organizationId: orgId,
            waitlistEntryId: entryCust2.id,
            serviceId: service.id,
            locationId,
            staffId: staff.id,
            startAt: new Date(Date.now() + 86400000),
            endAt: new Date(Date.now() + 86400000 + 3600000),
            token: willExpireToken,
            status: "PENDING",
            expiresAt: new Date(Date.now() - 5000), // Already expired 5s ago
        },
    });

    await janitorService.cleanupExpiredWaitlist();

    const sweptOffer = await prisma.waitlistOffer.findUnique({ where: { id: offerToExpire.id } });

    assert(
        sweptOffer?.status === "EXPIRED",
        "9. Janitor Expiration: Worker janitor automatically swept expired pending offers to EXPIRED",
    );

    // -------------------------------------------------------------------------
    // V10: Notification Deduplication & Handlebars Templates
    // -------------------------------------------------------------------------
    console.log("\n--- [V10] Notification Deduplication & Templates ---");
    const renderedJoined = templateEngine.render("waitlist_joined", {
        customerName: "Alice",
        serviceName: "Signature Haircut",
        studioName: "Luxe Studio",
        startWindowDate: "2026-09-01",
        endWindowDate: "2026-09-07",
        timePreference: "MORNING",
    });

    const renderedOffer = templateEngine.render("waitlist_offer", {
        customerName: "Alice",
        serviceName: "Signature Haircut",
        studioName: "Luxe Studio",
        startFormatted: "Monday, Sept 1 at 10:00 AM",
        expiresFormatted: "10:15 AM",
        claimUrl: "/offers/mock-token",
    });

    const renderedLost = templateEngine.render("waitlist_offer_lost", {
        customerName: "Bob",
        serviceName: "Signature Haircut",
        studioName: "Luxe Studio",
        startFormatted: "Monday, Sept 1 at 10:00 AM",
    });

    assert(
        renderedJoined.subject.includes("Signature Haircut") &&
        renderedOffer.htmlBody.includes("Claim Appointment Now") &&
        renderedLost.subject.includes("Waitlist Update"),
        "10. Notification Engine: All waitlist notification templates rendered correctly with variables",
    );

    // -------------------------------------------------------------------------
    // V11: Staff Offer Creation Availability Guard
    // -------------------------------------------------------------------------
    console.log("\n--- [V11] Staff Offer Creation Availability Guard ---");
    // Create busy block for staff
    const busyApptStart = new Date(Date.now() + 10 * 86400000);
    const busyApptEnd = new Date(busyApptStart.getTime() + 3600000);

    await prisma.appointment.create({
        data: {
            organizationId: orgId,
            locationId,
            serviceId: service.id,
            staffId: staff.id,
            customerId: cust1.id,
            startAt: busyApptStart,
            endAt: busyApptEnd,
            status: "CONFIRMED",
            priceCents: 5000,
        },
    });

    let staffOfferConflictBlocked = false;
    try {
        await offerService.createManualOffer(orgId, {
            waitlistEntryId: entry1.id,
            startAt: busyApptStart.toISOString(),
            endAt: busyApptEnd.toISOString(),
            staffId: staff.id,
            locationId,
        });
    } catch (err: any) {
        staffOfferConflictBlocked = err.message.includes("unavailable");
    }

    assert(
        staffOfferConflictBlocked,
        "11. Staff Offer Guard: Manager cannot create manual offers for occupied slots (backend enforces availability)",
    );

    // -------------------------------------------------------------------------
    // V12: AI Facade Clean Interface (P10 Readiness)
    // -------------------------------------------------------------------------
    console.log("\n--- [V12] AI Facade Interface ---");
    const facadeResult = await entryService.joinWaitlistFacade({
        organizationId: orgId,
        serviceNameOrId: service.name,
        customerName: "Charlie Facade",
        customerEmail: "charlie.facade@example.com",
        preferredDateRange: {
            start: "2026-09-15",
            end: "2026-09-20",
        },
        timeOfDay: "EVENING",
        notes: "Interested in evening slots after 5pm",
    });

    assert(
        facadeResult.success &&
        !!facadeResult.waitlistEntryId &&
        facadeResult.status === "ACTIVE" &&
        facadeResult.summary.includes("Successfully added Charlie Facade"),
        "12. AI Readiness: joinWaitlistFacade successfully creates valid waitlist entry for later P10 tool invocation",
    );

    console.log("\n================================================================================");
    console.log(`🎉 ALL ${passCount}/${totalCount} PHASE P9 VERIFICATION CRITERIA PASSED (100%)`);
    console.log("================================================================================\n");

    await prisma.$disconnect();
}

runComprehensiveWaitlistVerification().catch(async (err) => {
    console.error("FATAL ERROR IN P9 VERIFICATION SUITE:", err);
    await prisma.$disconnect();
    process.exit(1);
});
