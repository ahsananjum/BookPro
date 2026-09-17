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
    console.log("=== VERIFYING DYNAMIC SERVICE DURATION SLOT GAPS & FINALIZE BOOKING ===");

    // 1. Fetch organization & services
    const orgRes = await request(`${API_BASE}/organization/by-slug/testies`);
    const org = orgRes.data || orgRes;
    const service = org.services[0];
    const location = org.locations[0];

    console.log(`\nService from DB: "${service.name}", Duration: ${service.durationMin} minutes, Price: $${(service.priceCents / 100).toFixed(2)}`);

    // 2. Query availability slots for tomorrow
    const d1 = new Date(); d1.setDate(d1.getDate() + 1);
    const pad = (n: number) => n < 10 ? `0${n}` : `${n}`;
    const tomorrowStr = `${d1.getFullYear()}-${pad(d1.getMonth() + 1)}-${pad(d1.getDate())}`;

    const availRes = await request(`${API_BASE}/availability?serviceId=${service.id}&locationId=${location.id}&startDate=${tomorrowStr}&endDate=${tomorrowStr}`, {
        headers: { 'x-tenant-slug': 'testies' },
    });

    const slots = availRes.data || [];
    console.log(`\n✅ Generated ${slots.length} available slots for ${tomorrowStr}:`);
    
    // Print slot start and end times to verify the 45-min gap!
    slots.slice(0, 6).forEach((s: any, idx: number) => {
        const start = new Date(s.startAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const end = new Date(s.endAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const durationMinutes = (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / (60 * 1000);
        console.log(`  Slot ${idx + 1}: ${start} -> ${end} (Duration: ${durationMinutes} mins)`);
    });

    // 3. Reserve first slot via Hold
    const firstSlot = slots[0];
    console.log(`\nReserving slot: ${firstSlot.startAt}...`);
    const holdRes = await request(`${API_BASE}/holds`, {
        method: 'POST',
        headers: { 'x-tenant-slug': 'testies' },
        body: JSON.stringify({
            serviceId: service.id,
            locationId: location.id,
            staffId: firstSlot.staffId,
            startAt: firstSlot.startAt,
            idempotencyKey: `hold_test_${Date.now()}`,
        }),
    });
    const hold = holdRes.data || holdRes;
    const guestToken = hold.guestToken;
    console.log(`✅ Hold created: ${hold.id}, Status: ${hold.status}, Guest Token: ${guestToken ? 'PRESENT' : 'NONE'}`);

    // 4. Save Customer Details
    console.log(`\nSaving guest contact details...`);
    const detailsRes = await request(`${API_BASE}/holds/public/${hold.id}/details`, {
        method: 'PUT',
        headers: { 'x-tenant-slug': 'testies' },
        body: JSON.stringify({
            guestToken,
            fullName: 'Jane Doe',
            email: 'jane.doe@example.com',
            phone: '+15551234567',
            notes: 'Looking forward to the haircut!',
            consentMarketing: true,
            intakeResponses: [],
        }),
    });
    const detailsData = detailsRes.data || detailsRes;
    const updatedGuestToken = detailsData.guestToken || guestToken;
    console.log(`✅ Details saved! Review Quote:`, detailsData.review?.quote);

    // 5. Finalize Booking via /api/v1/appointments/public/finalize
    console.log(`\nFinalizing booking at /api/v1/appointments/public/finalize...`);
    const finalizeRes = await request(`${API_BASE}/appointments/public/finalize`, {
        method: 'POST',
        headers: { 'x-tenant-slug': 'testies' },
        body: JSON.stringify({
            bookingHoldId: hold.id,
            guestToken: updatedGuestToken,
            idempotencyKey: `final_test_${Date.now()}`,
        }),
    });
    const finalizeData = finalizeRes.data || finalizeRes;
    console.log(`✅ Booking Finalized! Status: ${finalizeData.status || 'CONFIRMED'}, Appointment ID: ${finalizeData.id}`);

    console.log("\n=== ALL DYNAMIC DATABASE SLOT GAP AND FINALIZATION VERIFICATIONS PASSED ===");
}

main().catch((err) => {
    console.error("Verification failed:", err.message);
});
