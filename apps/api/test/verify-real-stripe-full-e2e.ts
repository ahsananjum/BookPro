import * as dotenv from "dotenv";
dotenv.config();
import { Test } from "@nestjs/testing";
import { PrismaClient, PaymentRecordStatus } from "@prisma/client";
import { PaymentsModule } from "../src/modules/payments/payments.module";
import { PaymentsService } from "../src/modules/payments/payments.service";
import { AppointmentsModule } from "../src/modules/appointments/appointments.module";
import { AppointmentService } from "../src/modules/appointments/appointment.service";
import { DatabaseModule } from "../src/modules/database/database.module";
import { PrismaService } from "../src/modules/database/prisma.service";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const StripeSDK = require("stripe");
const StripeCtor = typeof StripeSDK === "function" ? StripeSDK : (StripeSDK.default || StripeSDK);
const stripe = new StripeCtor(process.env.STRIPE_SECRET_KEY as string);
const prisma = new PrismaClient();

async function runE2E() {
    console.log("================================================================================");
    console.log("    REAL STRIPE GATEWAY + POSTGRESQL + NESTJS IN-PROCESS E2E VERIFICATION       ");
    console.log("================================================================================");

    const moduleRef = await Test.createTestingModule({
        imports: [
            DatabaseModule,
            PaymentsModule,
            AppointmentsModule,
        ],
    }).compile();

    const paymentsService = moduleRef.get(PaymentsService);
    const appointmentService = moduleRef.get(AppointmentService);

    // 1. Fetch organization 'testies'
    console.log("\n[1/5] Fetching organization 'testies' from PostgreSQL...");
    const org = await prisma.organization.findUnique({
        where: { slug: "testies" },
        include: {
            services: true,
            locations: true,
        },
    });

    if (!org) throw new Error("Organization 'testies' not found in database");
    const service = org.services[0];
    const location = org.locations[0];

    console.log(`✅ Organization: "${org.name}" (ID: ${org.id})`);
    console.log(`✅ Stripe Connected Account: ${org.stripeAccountId}, Charges Enabled: ${org.stripeChargesEnabled}`);
    console.log(`✅ Service: "${service.name}", Price: ${service.currency} ${service.priceCents / 100}`);

    // 2. Create an Active Booking Hold
    console.log("\n[2/5] Creating BookingHold in PostgreSQL...");
    const d1 = new Date(); d1.setDate(d1.getDate() + 2);
    d1.setHours(10, 0, 0, 0);
    const d2 = new Date(d1.getTime() + service.durationMin * 60000);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const rawSecret = process.env.JWT_SECRET || process.env.APP_SECRET || "c051f6472ae70eb0c795501be1f1b9b304c1a1414063bd2a06a3b78c1567d429";
    const crypto = require("crypto");

    const hold = await prisma.bookingHold.create({
        data: {
            organizationId: org.id,
            locationId: location.id,
            serviceId: service.id,
            startAt: d1,
            endAt: d2,
            expiresAt,
            status: "ACTIVE",
            idempotencyKey: `hold_e2e_${Date.now()}`,
            partySize: 1,
            guestName: "Zainab Ahmed",
            guestEmail: "zainab.ahmed@example.com",
            guestPhone: "+923331234567",
            detailsCompletedAt: new Date(),
            consentMarketing: true,
            quoteSnapshot: {
                totalCents: 150000,
                basePriceCents: 150000,
                payableNowCents: 43500,
                remainingBalanceCents: 106500,
                currency: "PKR",
                quoteVersion: 1,
            },
        },
    });

    const payload = `${hold.id}:${org.id}:zainab.ahmed@example.com`;
    const sig = crypto.createHmac("sha256", rawSecret).update(payload).digest("hex");
    const guestToken = `gst_${Buffer.from(`${hold.id}:${sig}`).toString("base64url")}`;

    console.log(`✅ Hold created: ID ${hold.id}, Status: ${hold.status}`);
    console.log(`✅ Verified Guest Token generated.`);

    // 3. Create Real Stripe Payment Intent via PaymentsService
    console.log("\n[3/5] Initializing Real Stripe Payment Intent via PaymentsService...");
    const piIdempotencyKey = `pi_e2e_${hold.id}_${Date.now()}`;
    const piResult = await paymentsService.createPublicPaymentIntent({
        organizationId: org.id,
        body: {
            bookingHoldId: hold.id,
            guestToken,
            idempotencyKey: piIdempotencyKey,
        },
        idempotencyKey: piIdempotencyKey,
    });

    console.log("✅ SUCCESS! Real Stripe PaymentIntent created with zero errors:", {
        paymentRecordId: piResult.paymentRecordId,
        paymentIntentId: piResult.paymentIntentId,
        clientSecret: piResult.clientSecret ? "EXISTS (live secret from Stripe)" : "MISSING",
        amountCents: piResult.amountCents,
        currency: piResult.currency,
        status: piResult.status,
    });

    if (!piResult.clientSecret) throw new Error("Missing clientSecret from Stripe");
    if (piResult.amountCents !== 43500) throw new Error(`Unexpected amount: ${piResult.amountCents}`);

    // 4. Confirm PaymentIntent on real Stripe API
    console.log("\n[4/5] Confirming Payment on Stripe sandbox with test card...");
    const confirmedPI = await stripe.paymentIntents.confirm(piResult.paymentIntentId, {
        payment_method: "pm_card_visa",
    });
    console.log(`✅ Stripe server confirmation status: ${confirmedPI.status}`);

    if (confirmedPI.status !== "succeeded") {
        throw new Error(`Expected Stripe status 'succeeded', got '${confirmedPI.status}'`);
    }

    // 5. Poll & Reconcile Booking via AppointmentService.getPublicBookingStatus
    console.log("\n[5/5] Reconciling booking status via AppointmentService...");
    const bookingStatus = await appointmentService.getPublicBookingStatus(
        hold.id,
        org.id,
        guestToken
    );

    console.log("✅ Public Booking Status Output:", {
        status: bookingStatus.status,
        paymentStatus: bookingStatus.paymentStatus,
        appointmentId: bookingStatus.appointment?.id,
        referenceCode: bookingStatus.appointment?.referenceCode,
        serviceName: bookingStatus.appointment?.serviceName,
        startAt: bookingStatus.appointment?.startAt,
    });

    if (bookingStatus.status !== "CONFIRMED") {
        throw new Error(`Expected booking status 'CONFIRMED', got '${bookingStatus.status}'`);
    }

    // Verify DB records
    const finalAppt = await prisma.appointment.findFirst({
        where: { bookingHoldId: hold.id },
    });
    const finalHold = await prisma.bookingHold.findUnique({
        where: { id: hold.id },
    });
    const finalPayment = await prisma.paymentRecord.findFirst({
        where: { bookingHoldId: hold.id },
    });

    console.log("\n================================================================================");
    console.log("                         DATABASE INTEGRITY AUDIT                               ");
    console.log("================================================================================");
    console.log(`✅ Appointment in PostgreSQL: ID=${finalAppt?.id}, Status=${finalAppt?.status}, PaymentStatus=${finalAppt?.paymentStatus}`);
    console.log(`✅ BookingHold in PostgreSQL: ID=${finalHold?.id}, Status=${finalHold?.status}`);
    console.log(`✅ PaymentRecord in PostgreSQL: ID=${finalPayment?.id}, Status=${finalPayment?.status}, ProviderID=${finalPayment?.providerPaymentId}`);

    if (finalHold?.status !== "CONVERTED") throw new Error("Hold was not marked CONVERTED");
    if (finalPayment?.status !== PaymentRecordStatus.SUCCEEDED) throw new Error("Payment was not marked SUCCEEDED");
    if (!finalAppt) throw new Error("Appointment was not created in database");

    console.log("\n🎉 ZERO MOCKS: 100% REAL STRIPE + NESTJS + POSTGRESQL E2E FLOW VERIFIED!");
}

runE2E()
    .catch((err) => {
        console.error("\n❌ Test Failed:", err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
