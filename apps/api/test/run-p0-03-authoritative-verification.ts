import { AuthoritativeAvailabilityValidatorService } from "../src/modules/availability/authoritative-availability-validator.service";
import { PolicyResolver } from "../src/modules/availability/policy-resolver";
import { DurationCalculator } from "../src/modules/availability/duration-calculator";
import { EffectiveOperatingWindowBuilder } from "../src/modules/availability/effective-operating-window-builder";
import { StaffAvailabilityBuilder } from "../src/modules/availability/staff-availability-builder";
import { ResourceAvailabilityService } from "../src/modules/availability/resource-availability.service";
import { CapacityAvailabilityService } from "../src/modules/availability/capacity-availability.service";
import { ScheduleGuardService } from "../src/modules/concurrency/schedule-guard.service";
import { OutboxService } from "../src/modules/outbox/outbox.service";

async function runAuthoritativeVerification() {
    console.log("\n================================================================================");
    console.log("   BookPro P0-03 — Authoritative Availability Validator Comprehensive Suite   ");
    console.log("================================================================================\n");

    const orgId = "org-live-100";
    const foreignOrgId = "org-foreign-999";
    const locId = "loc-live-100";
    const srvSingleId = "srv-single-100";
    const srvGroupId = "srv-group-100";
    const staffId = "stf-live-100";
    const custId = "cust-live-100";

    const inMemoryDb: Record<string, any[]> = {
        locations: [
            {
                id: locId,
                organizationId: orgId,
                name: "Main Downtown Clinic",
                timezone: "UTC",
                operatingHours: [
                    { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isClosed: false },
                    { dayOfWeek: 2, startTime: "09:00", endTime: "17:00", isClosed: false },
                    { dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isClosed: false },
                    { dayOfWeek: 4, startTime: "09:00", endTime: "17:00", isClosed: false },
                    { dayOfWeek: 5, startTime: "09:00", endTime: "17:00", isClosed: false },
                ],
                locationHolidays: [
                    { date: new Date("2026-09-08T00:00:00.000Z"), name: "Closed Holiday", isClosed: true },
                ],
                archivedAt: null,
            },
        ],
        services: [
            {
                id: srvSingleId,
                organizationId: orgId,
                name: "1-on-1 Consultation",
                durationMin: 30,
                preBufferMin: 5,
                postBufferMin: 10,
                capacity: 1,
                minParticipants: 1,
                maxParticipants: 1,
                priceCents: 10000,
                depositType: "PERCENTAGE",
                depositValue: 20,
                currency: "USD",
                isActive: true,
                archivedAt: null,
            },
            {
                id: srvGroupId,
                organizationId: orgId,
                name: "Group Fitness Class",
                durationMin: 60,
                preBufferMin: 0,
                postBufferMin: 0,
                capacity: 5,
                minParticipants: 1,
                maxParticipants: 5,
                priceCents: 3000,
                depositType: "FIXED",
                depositValue: 1000,
                currency: "USD",
                isActive: true,
                archivedAt: null,
            },
        ],
        staffProfiles: [
            {
                id: staffId,
                organizationId: orgId,
                displayName: "Dr. Alice Morgan",
                isActive: true,
                archivedAt: null,
                staffLocations: [{ locationId: locId }],
                staffServices: [
                    { serviceId: srvSingleId, customPriceCents: 12000, customDurationMin: 40 },
                    { serviceId: srvGroupId, customPriceCents: 3000, customDurationMin: 60 },
                ],
                availabilities: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
                breaks: [{ dayOfWeek: 1, startTime: "13:00", endTime: "14:00" }],
                leaves: [
                    {
                        status: "APPROVED",
                        startDate: new Date("2026-09-14T00:00:00.000Z"),
                        endDate: new Date("2026-09-14T23:59:59.999Z"),
                    },
                ],
                scheduleBlocks: [],
            },
        ],
        customers: [
            { id: custId, organizationId: orgId, fullName: "Alice Customer", email: "alice@example.com" },
        ],
        policyConfigs: [
            {
                organizationId: orgId,
                minNoticeHours: 1,
                maxNoticeDays: 60,
                holdDurationMinutes: 10,
            },
        ],
        bookingHolds: [],
        appointments: [],
        auditLogs: [],
        outbox: [],
    };

    const mockPrisma: any = {
        location: {
            findFirst: async ({ where }: any) =>
                inMemoryDb.locations.find((l) => l.id === where.id && (!where.organizationId || l.organizationId === where.organizationId)) || null,
        },
        service: {
            findFirst: async ({ where }: any) =>
                inMemoryDb.services.find((s) => s.id === where.id && (!where.organizationId || s.organizationId === where.organizationId) && (!where.isActive || s.isActive)) || null,
        },
        customer: {
            findFirst: async ({ where }: any) =>
                inMemoryDb.customers.find((c) => c.id === where.id && (!where.organizationId || c.organizationId === where.organizationId)) || null,
        },
        staffProfile: {
            findFirst: async ({ where }: any) =>
                inMemoryDb.staffProfiles.find((s) => s.id === where.id && (!where.organizationId || s.organizationId === where.organizationId)) || null,
        },
        serviceResource: {
            findMany: async () => [],
        },
        scheduleBlock: {
            findMany: async () => [],
        },
        policyConfig: {
            findFirst: async () => inMemoryDb.policyConfigs[0],
        },
        appointment: {
            findFirst: async ({ where }: any) => {
                return inMemoryDb.appointments.find((a) => {
                    if (where.id) {
                        if (typeof where.id === "string" && a.id !== where.id) return false;
                        if (where.id.not && a.id === where.id.not) return false;
                    }
                    if (where.organizationId && a.organizationId !== where.organizationId) return false;
                    if (where.bookingHoldId) {
                        if (typeof where.bookingHoldId === "string" && a.bookingHoldId !== where.bookingHoldId) return false;
                        if (where.bookingHoldId.not && a.bookingHoldId === where.bookingHoldId.not) return false;
                    }
                    if (where.status?.in && !where.status.in.includes(a.status)) return false;
                    if (where.staffId && a.staffId !== where.staffId) return false;
                    if (where.startAt && where.endAt) {
                        const apptStart = new Date(a.startAt).getTime();
                        const apptEnd = new Date(a.endAt).getTime();
                        const checkStart = new Date(where.endAt.gt).getTime();
                        const checkEnd = new Date(where.startAt.lt).getTime();
                        return apptStart < checkEnd && apptEnd > checkStart;
                    }
                    return true;
                }) || null;
            },
            findMany: async ({ where }: any) => {
                return inMemoryDb.appointments.filter((a) => {
                    if (where.organizationId && a.organizationId !== where.organizationId) return false;
                    if (where.serviceId && a.serviceId !== where.serviceId) return false;
                    if (where.id?.not && a.id === where.id.not) return false;
                    if (where.startAt && where.endAt) {
                        const apptStart = new Date(a.startAt).getTime();
                        const apptEnd = new Date(a.endAt).getTime();
                        const checkStart = new Date(where.endAt.gt).getTime();
                        const checkEnd = new Date(where.startAt.lt).getTime();
                        return apptStart < checkEnd && apptEnd > checkStart;
                    }
                    return true;
                });
            },
            count: async ({ where }: any) => {
                const list = inMemoryDb.appointments.filter((a) => {
                    if (where.organizationId && a.organizationId !== where.organizationId) return false;
                    if (where.status?.in && !where.status.in.includes(a.status)) return false;
                    if (where.staffId && a.staffId !== where.staffId) return false;
                    const apptStart = new Date(a.startAt).getTime();
                    const apptEnd = new Date(a.endAt).getTime();
                    const checkStart = new Date(where.endAt.gt).getTime();
                    const checkEnd = new Date(where.startAt.lt).getTime();
                    return apptStart < checkEnd && apptEnd > checkStart;
                });
                return list.length;
            },
            create: async ({ data }: any) => {
                const record = { id: `appt-${Date.now()}-${Math.random()}`, ...data, version: 1 };
                inMemoryDb.appointments.push(record);
                return record;
            },
            update: async ({ where, data }: any) => {
                const idx = inMemoryDb.appointments.findIndex((a) => a.id === where.id);
                if (idx !== -1) {
                    inMemoryDb.appointments[idx] = { ...inMemoryDb.appointments[idx], ...data, version: (inMemoryDb.appointments[idx].version || 1) + 1 };
                    return inMemoryDb.appointments[idx];
                }
                return null;
            },
        },
        bookingHold: {
            findFirst: async ({ where }: any) => {
                return inMemoryDb.bookingHolds.find((h) => {
                    if (where.id && h.id !== where.id) return false;
                    if (where.organizationId && h.organizationId !== where.organizationId) return false;
                    if (where.status && h.status !== where.status) return false;
                    return true;
                }) || null;
            },
            findMany: async ({ where }: any) => {
                return inMemoryDb.bookingHolds.filter((h) => {
                    if (where.organizationId && h.organizationId !== where.organizationId) return false;
                    if (where.serviceId && h.serviceId !== where.serviceId) return false;
                    if (where.status && h.status !== where.status) return false;
                    if (where.expiresAt?.gt && new Date(h.expiresAt) <= where.expiresAt.gt) return false;
                    if (where.startAt && where.endAt) {
                        const holdStart = new Date(h.startAt).getTime();
                        const holdEnd = new Date(h.endAt).getTime();
                        const checkStart = new Date(where.endAt.gt).getTime();
                        const checkEnd = new Date(where.startAt.lt).getTime();
                        return holdStart < checkEnd && holdEnd > checkStart;
                    }
                    return true;
                });
            },
            count: async ({ where }: any) => {
                const list = inMemoryDb.bookingHolds.filter((h) => {
                    if (where.organizationId && h.organizationId !== where.organizationId) return false;
                    if (where.status && h.status !== where.status) return false;
                    if (where.expiresAt?.gt && new Date(h.expiresAt) <= where.expiresAt.gt) return false;
                    const holdStart = new Date(h.startAt).getTime();
                    const holdEnd = new Date(h.endAt).getTime();
                    const checkStart = new Date(where.endAt.gt).getTime();
                    const checkEnd = new Date(where.startAt.lt).getTime();
                    return holdStart < checkEnd && holdEnd > checkStart;
                });
                return list.length;
            },
            create: async ({ data }: any) => {
                const record = { id: `hold-${Date.now()}-${Math.random()}`, ...data };
                inMemoryDb.bookingHolds.push(record);
                return record;
            },
            update: async ({ where, data }: any) => {
                const idx = inMemoryDb.bookingHolds.findIndex((h) => h.id === where.id);
                if (idx !== -1) {
                    inMemoryDb.bookingHolds[idx] = { ...inMemoryDb.bookingHolds[idx], ...data };
                    return inMemoryDb.bookingHolds[idx];
                }
                return null;
            },
            updateMany: async ({ where, data }: any) => {
                let count = 0;
                inMemoryDb.bookingHolds = inMemoryDb.bookingHolds.map((h) => {
                    if (h.id === where.id && h.organizationId === where.organizationId && h.status === where.status) {
                        if (where.expiresAt?.gt && new Date(h.expiresAt) <= where.expiresAt.gt) {
                            return h;
                        }
                        count++;
                        return { ...h, ...data };
                    }
                    return h;
                });
                return { count };
            },
        },
        scheduleGuard: {
            upsert: async () => ({}),
            findMany: async () => [],
        },
        appointmentHistory: { create: async () => ({ id: "hist-1" }) },
        appointmentResource: { create: async () => ({ id: "ar-1" }) },
        intakeResponse: { create: async () => ({ id: "ir-1" }) },
        auditLog: {
            create: async ({ data }: any) => {
                inMemoryDb.auditLogs.push(data);
                return { id: "audit-1", ...data };
            },
        },
        outboxEvent: {
            create: async ({ data }: any) => {
                inMemoryDb.outbox.push(data);
                return { id: "out-1", ...data };
            },
        },
        $executeRaw: async () => 1,
        $queryRaw: async () => [],
        $transaction: async (cb: any) => cb(mockPrisma),
    };

    const scheduleGuard = new ScheduleGuardService(mockPrisma);
    const outbox = new OutboxService(mockPrisma);
    const policyResolver = new PolicyResolver(mockPrisma);
    const durationCalc = new DurationCalculator();
    const opWindowBuilder = new EffectiveOperatingWindowBuilder();
    const staffBuilder = new StaffAvailabilityBuilder();
    const resourceService = new ResourceAvailabilityService(mockPrisma);
    const capacityService = new CapacityAvailabilityService(mockPrisma);

    const validator = new AuthoritativeAvailabilityValidatorService(
        mockPrisma,
        scheduleGuard,
        outbox,
        policyResolver,
        durationCalc,
        opWindowBuilder,
        staffBuilder,
        resourceService,
        capacityService,
    );

    let passCount = 0;
    const test = (name: string, fn: () => Promise<void>) => {
        return fn()
            .then(() => {
                console.log(`  [PASS] ${name}`);
                passCount++;
            })
            .catch((err) => {
                console.error(`  [FAIL] ${name}:`, err.message);
                throw err;
            });
    };

    const mondayStartIso = "2026-09-07T10:00:00.000Z";

    // 1. Search & Write Parity
    await test("1. Valid slot passes authoritative read validation with server quote and duration", async () => {
        const res = await validator.validateSlotForRead(orgId, locId, srvSingleId, staffId, mondayStartIso);
        if (!res.isAvailable) throw new Error("Slot should be available");
        if (res.serviceDurationMinutes !== 40) throw new Error(`Expected 40 min custom staff duration, got ${res.serviceDurationMinutes}`);
        if (res.occupiedInterval.durationMinutes !== 55) throw new Error(`Expected 55 min total occupied duration, got ${res.occupiedInterval.durationMinutes}`);
        if (res.quoteSnapshot.priceCents !== 12000) throw new Error(`Expected $120.00 custom staff price, got ${res.quoteSnapshot.priceCents}`);
    });

    // 2. Reject out of operating hours
    await test("2. Rejects slot outside operating hours (06:00 UTC)", async () => {
        try {
            await validator.validateSlotForRead(orgId, locId, srvSingleId, staffId, "2026-09-07T06:00:00.000Z");
            throw new Error("Should have thrown ConflictException");
        } catch (e: any) {
            if (!e.message.includes("outside location operating hours")) throw e;
        }
    });

    // 3. Reject location holiday
    await test("3. Rejects slot during location holiday closure (2026-09-08)", async () => {
        try {
            await validator.validateSlotForRead(orgId, locId, srvSingleId, staffId, "2026-09-08T10:00:00.000Z");
            throw new Error("Should have thrown ConflictException");
        } catch (e: any) {
            const msg = (e.message || "") + JSON.stringify(e.response || {});
            if (!msg.toLowerCase().includes("closed") && !msg.toLowerCase().includes("holiday")) throw e;
        }
    });

    // 4. Reject staff lunch break
    await test("4. Rejects slot during staff lunch break (13:00-14:00 UTC)", async () => {
        try {
            await validator.validateSlotForRead(orgId, locId, srvSingleId, staffId, "2026-09-07T13:00:00.000Z");
            throw new Error("Should have thrown ConflictException");
        } catch (e: any) {
            if (!e.message.includes("unavailable during the requested time")) throw e;
        }
    });

    // 5. Cross-Tenant ID Rejection
    await test("5. Rejects booking with foreign tenant organization ID", async () => {
        try {
            await validator.validateAndReserveSlot({
                organizationId: foreignOrgId,
                locationId: locId,
                serviceId: srvSingleId,
                startAt: mondayStartIso,
                targetType: "HOLD",
            });
            throw new Error("Should have thrown NotFoundException");
        } catch (e: any) {
            if (!e.message.includes("not found")) throw e;
        }
    });

    // 6. Pessimistic Concurrency & Collision Block
    await test("6. Prevents double-booking: 1st hold succeeds, 2nd hold on same slot is rejected", async () => {
        const hold1 = await validator.validateAndReserveSlot({
            organizationId: orgId,
            locationId: locId,
            serviceId: srvSingleId,
            staffId,
            startAt: mondayStartIso,
            targetType: "HOLD",
        });
        if (!hold1.success || !hold1.bookingHold) throw new Error("Hold 1 failed");

        try {
            await validator.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: srvSingleId,
                staffId,
                startAt: mondayStartIso,
                targetType: "HOLD",
            });
            throw new Error("Hold 2 should have been rejected with ConflictException");
        } catch (e: any) {
            if (!e.message.includes("temporarily held") && !e.message.includes("already reserved")) throw e;
        }
    });

    // 7. Atomic Hold Conversion & Duplicate Conversion Idempotency
    await test("7. Converts hold to appointment atomically and handles duplicate webhook conversion idempotently", async () => {
        const holdRes = inMemoryDb.bookingHolds[0];
        const appt1 = await validator.validateAndReserveSlot({
            organizationId: orgId,
            locationId: locId,
            serviceId: srvSingleId,
            staffId,
            customerId: custId,
            startAt: mondayStartIso,
            targetType: "APPOINTMENT",
            appointmentDetails: {
                bookingHoldId: holdRes.id,
                paymentStatus: "PAID",
                bookingSource: "CUSTOMER_WEB",
            },
        });
        if (!appt1.success || !appt1.appointment) throw new Error("Appointment conversion failed");

        // Duplicate conversion attempt
        const appt2 = await validator.validateAndReserveSlot({
            organizationId: orgId,
            locationId: locId,
            serviceId: srvSingleId,
            staffId,
            customerId: custId,
            startAt: mondayStartIso,
            targetType: "APPOINTMENT",
            appointmentDetails: {
                bookingHoldId: holdRes.id,
                paymentStatus: "PAID",
            },
        });
        if (appt2.appointment?.id !== appt1.appointment?.id) throw new Error("Duplicate conversion did not return existing appointment idempotently");
    });

    // 8. Group Capacity Validation
    await test("8. Group service allows capacity consumption up to limit and rejects overflow", async () => {
        const groupStartIso = "2026-09-07T14:00:00.000Z";
        // Booking 1: party size 3 (capacity 5)
        const b1 = await validator.validateAndReserveSlot({
            organizationId: orgId,
            locationId: locId,
            serviceId: srvGroupId,
            staffId,
            customerId: custId,
            startAt: groupStartIso,
            partySize: 3,
            targetType: "APPOINTMENT",
        });
        if (!b1.success) throw new Error("Group booking 1 failed");

        // Booking 2: party size 2 (3 + 2 = 5 -> exactly matches capacity 5)
        const b2 = await validator.validateAndReserveSlot({
            organizationId: orgId,
            locationId: locId,
            serviceId: srvGroupId,
            staffId,
            customerId: custId,
            startAt: groupStartIso,
            partySize: 2,
            targetType: "APPOINTMENT",
        });
        if (!b2.success) throw new Error("Group booking 2 failed");

        // Booking 3: party size 1 (5 + 1 = 6 -> exceeds capacity)
        try {
            await validator.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: srvGroupId,
                staffId,
                customerId: custId,
                startAt: groupStartIso,
                partySize: 1,
                targetType: "APPOINTMENT",
            });
            throw new Error("Group booking 3 should have failed with capacity exceeded");
        } catch (e: any) {
            if (!e.message.includes("exceeds remaining available capacity")) throw e;
        }
    });

    // 9. Audited Staff Override
    await test("9. Audited staff manual override creates appointment and persists audit log", async () => {
        const overrideStartIso = "2026-09-07T06:00:00.000Z"; // Outside normal hours
        const res = await validator.validateAndReserveSlot({
            organizationId: orgId,
            locationId: locId,
            serviceId: srvSingleId,
            staffId,
            customerId: custId,
            startAt: overrideStartIso,
            targetType: "APPOINTMENT",
            override: {
                actorType: "STAFF",
                actorId: "stf-admin-1",
                reason: "Emergency appointment approved by practice director",
            },
        });
        if (!res.success || !res.appointment) throw new Error("Override booking failed");
        if (inMemoryDb.auditLogs.length !== 1) throw new Error("Audit log was not created for override");
        if (inMemoryDb.auditLogs[0].payload.reason !== "Emergency appointment approved by practice director") {
            throw new Error("Audit log reason mismatch");
        }
    });

    console.log("\n================================================================================");
    console.log(`   P0-03 VERIFICATION RESULT: ${passCount}/9 CRITICAL TEST SCENARIOS PASSED 100%   `);
    console.log("================================================================================\n");
}

runAuthoritativeVerification().catch((err) => {
    console.error("FATAL VERIFICATION FAILURE:", err);
    process.exit(1);
});
