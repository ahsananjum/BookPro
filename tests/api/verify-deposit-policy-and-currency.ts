import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:4000/api/v1';

async function request(url: string, options: any = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    const text = await res.text();
    let json: any;
    try {
        json = JSON.parse(text);
    } catch {
        json = text;
    }
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
    }
    return json;
}

async function main() {
    console.log("=== VERIFYING DEPOSIT POLICY & MULTI-CURRENCY INTEGRATION ===");

    // 1. Fetch organization from API
    const orgRes = await request(`${API_BASE}/organization/by-slug/testies`);
    const org = orgRes.data || orgRes;
    const service = org.services[0];
    const location = org.locations[0];

    const serviceFromDb = await prisma.service.findUnique({
        where: { id: service.id },
    });

    console.log(`\nOrganization: "${org.name}", Currency: ${org.currency}`);
    console.log(`Service from DB: "${serviceFromDb?.name}", Price: ${((serviceFromDb?.priceCents || 0) / 100).toFixed(2)} ${serviceFromDb?.currency}`);
    console.log(`Deposit Policy: ${serviceFromDb?.depositType} (${serviceFromDb?.depositValue}%)`);

    if (serviceFromDb?.currency !== 'PKR') {
        throw new Error(`Expected service currency to be PKR, got ${serviceFromDb?.currency}`);
    }

    // 2. Query availability
    const d1 = new Date(); d1.setDate(d1.getDate() + 1);
    const pad = (n: number) => n < 10 ? `0${n}` : `${n}`;
    const tomorrowStr = `${d1.getFullYear()}-${pad(d1.getMonth() + 1)}-${pad(d1.getDate())}`;

    const availRes = await request(`${API_BASE}/availability?serviceId=${service.id}&locationId=${location.id}&startDate=${tomorrowStr}&endDate=${tomorrowStr}`, {
        headers: { 'x-tenant-slug': 'testies' },
    });
    const slots = availRes.data || [];
    const firstSlot = slots[0];

    // 3. Create Hold & Check Server-Authoritative Quote
    const holdRes = await request(`${API_BASE}/holds`, {
        method: 'POST',
        headers: { 'x-tenant-slug': 'testies' },
        body: JSON.stringify({
            serviceId: service.id,
            locationId: location.id,
            staffId: firstSlot.staffId,
            startAt: firstSlot.startAt,
            idempotencyKey: `hold_dep_${Date.now()}`,
        }),
    });
    const hold = holdRes.data || holdRes;
    const holdFromDb = await prisma.bookingHold.findUnique({
        where: { id: hold.id },
    });

    const quote = holdFromDb?.quoteSnapshot as any;
    console.log(`\n✅ Database Quote Snapshot:`, {
        currency: quote.currency,
        basePriceCents: quote.basePriceCents,
        taxAmountCents: quote.taxAmountCents,
        depositAmountCents: quote.depositAmountCents,
        payableNowCents: quote.payableNowCents,
        remainingBalanceCents: quote.remainingBalanceCents,
    });

    // Total = basePrice + tax
    const totalAmountCents = quote.basePriceCents + (quote.taxAmountCents || 0);
    const expectedDepositCents = Math.round((totalAmountCents * (serviceFromDb?.depositValue || 0)) / 100);

    if (quote.currency !== 'PKR') {
        throw new Error(`Expected quote currency 'PKR', got '${quote.currency}'`);
    }
    if (quote.payableNowCents !== expectedDepositCents) {
        throw new Error(`Expected payableNowCents ${expectedDepositCents}, got ${quote.payableNowCents}`);
    }
    if (quote.remainingBalanceCents !== (totalAmountCents - expectedDepositCents)) {
        throw new Error(`Expected remainingBalanceCents ${totalAmountCents - expectedDepositCents}, got ${quote.remainingBalanceCents}`);
    }
    console.log(`✅ ${serviceFromDb?.depositValue}% Deposit correctly calculated: ${quote.payableNowCents / 100} ${quote.currency} due now, ${quote.remainingBalanceCents / 100} ${quote.currency} due at studio.`);

    // 4. Save Customer details
    const detailsRes = await request(`${API_BASE}/holds/public/${hold.id}/details`, {
        method: 'PUT',
        headers: { 'x-tenant-slug': 'testies' },
        body: JSON.stringify({
            guestToken: hold.guestToken,
            fullName: 'Amina Khan',
            email: 'amina.khan@example.com',
            phone: '+923001234567',
            notes: 'Deposit policy & PKR currency verification test.',
            consentMarketing: true,
            intakeResponses: [],
        }),
    });
    const detailsData = detailsRes.data || detailsRes;
    const guestToken = detailsData.guestToken || hold.guestToken;

    // 5. Finalize Appointment & Check Database Record
    const finalizeRes = await request(`${API_BASE}/appointments/public/finalize`, {
        method: 'POST',
        headers: { 'x-tenant-slug': 'testies' },
        body: JSON.stringify({
            bookingHoldId: hold.id,
            guestToken,
            idempotencyKey: `final_dep_${Date.now()}`,
        }),
    });
    const finalizeData = finalizeRes.data || finalizeRes;
    const apptId = finalizeData.id || finalizeData.appointment?.id;

    const apptFromDb = await prisma.appointment.findUnique({
        where: { id: apptId },
    });

    console.log(`\n✅ Confirmed Appointment in PostgreSQL:`, {
        id: apptFromDb?.id,
        status: apptFromDb?.status,
        paymentStatus: apptFromDb?.paymentStatus,
        priceCents: apptFromDb?.priceCents,
        currency: apptFromDb?.currency,
    });

    if (apptFromDb?.currency !== 'PKR') {
        throw new Error(`Expected appointment currency 'PKR', got '${apptFromDb?.currency}'`);
    }
    if (apptFromDb?.priceCents !== quote.basePriceCents) {
        throw new Error(`Expected appointment priceCents ${quote.basePriceCents}, got ${apptFromDb?.priceCents}`);
    }

    console.log("\n=== ALL DEPOSIT POLICY AND DYNAMIC CURRENCY VERIFICATIONS PASSED SUCCESSFULLY ===");
}

main()
    .catch((err) => {
        console.error("Verification failed:", err.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
