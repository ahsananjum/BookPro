import { Test, TestingModule } from "@nestjs/testing";
import { AuthoritativeAvailabilityValidatorService } from "./authoritative-availability-validator.service";
import { PolicyResolver } from "./policy-resolver";
import { DurationCalculator } from "./duration-calculator";
import { EffectiveOperatingWindowBuilder } from "./effective-operating-window-builder";
import { StaffAvailabilityBuilder } from "./staff-availability-builder";
import { ResourceAvailabilityService } from "./resource-availability.service";
import { CapacityAvailabilityService } from "./capacity-availability.service";
import { ScheduleGuardService } from "../concurrency/schedule-guard.service";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../database/prisma.service";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

describe("P0-03 Authoritative Availability Validator Comprehensive Suite", () => {
    let service: AuthoritativeAvailabilityValidatorService;

    const orgId = "org-authoritative-1";
    const otherOrgId = "org-foreign-2";
    const locId = "loc-authoritative-1";
    const foreignLocId = "loc-foreign-2";
    const serviceId = "srv-authoritative-1";
    const foreignServiceId = "srv-foreign-2";
    const staffId = "stf-authoritative-1";
    const customerId = "cust-authoritative-1";
    const foreignCustomerId = "cust-foreign-2";

    // Standard Monday slot at 10:00 UTC (10:00-10:45 occupied, 10:05-10:35 service)
    const validStartIso = "2026-09-07T10:00:00.000Z";

    const mockLocation = {
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
            { date: new Date("2026-09-08T00:00:00.000Z"), name: "Clinic Closed Day", isClosed: true },
        ],
        archivedAt: null,
    };

    const mockService = {
        id: serviceId,
        organizationId: orgId,
        name: "General Consultation",
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
    };

    const mockStaffProfile = {
        id: staffId,
        organizationId: orgId,
        displayName: "Dr. Alice Morgan",
        isActive: true,
        archivedAt: null,
        staffLocations: [{ locationId: locId }],
        staffServices: [{ serviceId: serviceId, customPriceCents: 12000, customDurationMin: 40 }],
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
    };

    const mockCustomer = {
        id: customerId,
        organizationId: orgId,
        fullName: "John Customer",
        email: "john@example.com",
    };

    let mockAppointments: any[] = [];
    let mockBookingHolds: any[] = [];
    let mockAuditLogs: any[] = [];
    let mockOutboxEvents: any[] = [];

    const mockPrisma: any = {
        location: {
            findFirst: jest.fn().mockImplementation(({ where }) => {
                if (where.organizationId === orgId && where.id === locId) return Promise.resolve(mockLocation);
                return Promise.resolve(null);
            }),
        },
        service: {
            findFirst: jest.fn().mockImplementation(({ where }) => {
                if (where.organizationId === orgId && where.id === serviceId) return Promise.resolve(mockService);
                return Promise.resolve(null);
            }),
        },
        customer: {
            findFirst: jest.fn().mockImplementation(({ where }) => {
                if (where.organizationId === orgId && where.id === customerId) return Promise.resolve(mockCustomer);
                return Promise.resolve(null);
            }),
        },
        staffProfile: {
            findFirst: jest.fn().mockImplementation(({ where }) => {
                if (where.organizationId === orgId && where.id === staffId) return Promise.resolve(mockStaffProfile);
                return Promise.resolve(null);
            }),
        },
        serviceResource: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        scheduleBlock: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        policyConfig: {
            findFirst: jest.fn().mockResolvedValue({
                minNoticeHours: 1,
                maxNoticeDays: 60,
                holdDurationMinutes: 10,
            }),
        },
        appointment: {
            findFirst: jest.fn().mockImplementation(({ where }) => {
                const found = mockAppointments.find((a) => {
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
                });
                return Promise.resolve(found || null);
            }),
            findMany: jest.fn().mockImplementation(({ where }) => {
                return Promise.resolve(
                    mockAppointments.filter((a) => a.organizationId === where.organizationId),
                );
            }),
            count: jest.fn().mockImplementation(({ where }) => {
                const overlapping = mockAppointments.filter((a) => {
                    if (where.organizationId && a.organizationId !== where.organizationId) return false;
                    if (where.status?.in && !where.status.in.includes(a.status)) return false;
                    if (where.staffId && a.staffId !== where.staffId) return false;
                    const apptStart = new Date(a.startAt).getTime();
                    const apptEnd = new Date(a.endAt).getTime();
                    const checkStart = new Date(where.endAt.gt).getTime();
                    const checkEnd = new Date(where.startAt.lt).getTime();
                    return apptStart < checkEnd && apptEnd > checkStart;
                });
                return Promise.resolve(overlapping.length);
            }),
            create: jest.fn().mockImplementation(({ data }) => {
                const appt = { id: `appt-${Date.now()}-${Math.random()}`, ...data, version: 1 };
                mockAppointments.push(appt);
                return Promise.resolve(appt);
            }),
            update: jest.fn().mockImplementation(({ where, data }) => {
                const idx = mockAppointments.findIndex((a) => a.id === where.id);
                if (idx !== -1) {
                    mockAppointments[idx] = { ...mockAppointments[idx], ...data, version: (mockAppointments[idx].version || 1) + 1 };
                    return Promise.resolve(mockAppointments[idx]);
                }
                return Promise.resolve(null);
            }),
        },
        bookingHold: {
            findFirst: jest.fn().mockImplementation(({ where }) => {
                const found = mockBookingHolds.find((h) => {
                    if (where.id && h.id !== where.id) return false;
                    if (where.organizationId && h.organizationId !== where.organizationId) return false;
                    if (where.status && h.status !== where.status) return false;
                    return true;
                });
                return Promise.resolve(found || null);
            }),
            findMany: jest.fn().mockImplementation(({ where }) => {
                return Promise.resolve(mockBookingHolds.filter((h) => h.organizationId === where.organizationId));
            }),
            count: jest.fn().mockImplementation(({ where }) => {
                const overlapping = mockBookingHolds.filter((h) => {
                    if (where.organizationId && h.organizationId !== where.organizationId) return false;
                    if (where.status && h.status !== where.status) return false;
                    if (where.expiresAt?.gt && new Date(h.expiresAt) <= where.expiresAt.gt) return false;
                    const holdStart = new Date(h.startAt).getTime();
                    const holdEnd = new Date(h.endAt).getTime();
                    const checkStart = new Date(where.endAt.gt).getTime();
                    const checkEnd = new Date(where.startAt.lt).getTime();
                    return holdStart < checkEnd && holdEnd > checkStart;
                });
                return Promise.resolve(overlapping.length);
            }),
            create: jest.fn().mockImplementation(({ data }) => {
                const hold = { id: `hold-${Date.now()}-${Math.random()}`, ...data };
                mockBookingHolds.push(hold);
                return Promise.resolve(hold);
            }),
            update: jest.fn().mockImplementation(({ where, data }) => {
                const idx = mockBookingHolds.findIndex((h) => h.id === where.id);
                if (idx !== -1) {
                    mockBookingHolds[idx] = { ...mockBookingHolds[idx], ...data };
                    return Promise.resolve(mockBookingHolds[idx]);
                }
                return Promise.resolve(null);
            }),
            updateMany: jest.fn().mockImplementation(({ where, data }) => {
                let count = 0;
                mockBookingHolds = mockBookingHolds.map((h) => {
                    if (h.id === where.id && h.organizationId === where.organizationId && h.status === where.status) {
                        if (where.expiresAt?.gt && new Date(h.expiresAt) <= where.expiresAt.gt) {
                            return h;
                        }
                        count++;
                        return { ...h, ...data };
                    }
                    return h;
                });
                return Promise.resolve({ count });
            }),
        },
        appointmentHistory: {
            create: jest.fn().mockResolvedValue({ id: "hist-1" }),
        },
        appointmentResource: {
            create: jest.fn().mockResolvedValue({ id: "ar-1" }),
        },
        intakeResponse: {
            create: jest.fn().mockResolvedValue({ id: "ir-1" }),
        },
        auditLog: {
            create: jest.fn().mockImplementation(({ data }) => {
                mockAuditLogs.push(data);
                return Promise.resolve({ id: "audit-1", ...data });
            }),
        },
        $transaction: jest.fn().mockImplementation(async (callback) => {
            return callback(mockPrisma);
        }),
    };

    const mockScheduleGuardService: any = {
        buildGuardKeys: jest.fn().mockReturnValue(["guard-1", "guard-2"]),
        acquireGuardsInTx: jest.fn().mockResolvedValue(undefined),
    };

    const mockOutboxService: any = {
        emitInTx: jest.fn().mockImplementation((tx, event) => {
            mockOutboxEvents.push(event);
            return Promise.resolve();
        }),
    };

    beforeEach(async () => {
        mockAppointments = [];
        mockBookingHolds = [];
        mockAuditLogs = [];
        mockOutboxEvents = [];
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthoritativeAvailabilityValidatorService,
                PolicyResolver,
                DurationCalculator,
                EffectiveOperatingWindowBuilder,
                StaffAvailabilityBuilder,
                ResourceAvailabilityService,
                CapacityAvailabilityService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: ScheduleGuardService, useValue: mockScheduleGuardService },
                { provide: OutboxService, useValue: mockOutboxService },
            ],
        }).compile();

        service = module.get<AuthoritativeAvailabilityValidatorService>(
            AuthoritativeAvailabilityValidatorService,
        );
    });

    describe("1. Search & Read Validation Parity", () => {
        it("should validate a perfectly aligned slot for read", async () => {
            const res = await service.validateSlotForRead(
                orgId,
                locId,
                serviceId,
                staffId,
                validStartIso,
                1,
            );

            expect(res.isAvailable).toBe(true);
            expect(res.serviceDurationMinutes).toBe(40); // Staff custom duration
            expect(res.totalDurationMinutes).toBe(40); // Service + Addons
            expect(res.occupiedInterval.durationMinutes).toBe(55); // 40 + 5 pre + 10 post
            expect(res.quoteSnapshot.priceCents).toBe(12000); // Staff custom price
            expect(res.quoteSnapshot.depositAmountCents).toBe(2400); // 20% of 12000
        });

        it("should reject slot outside location operating hours (e.g. 06:00 UTC)", async () => {
            await expect(
                service.validateSlotForRead(
                    orgId,
                    locId,
                    serviceId,
                    staffId,
                    "2026-09-07T06:00:00.000Z",
                ),
            ).rejects.toThrow(ConflictException);
        });

        it("should reject slot during location holiday closure (2026-09-08)", async () => {
            await expect(
                service.validateSlotForRead(
                    orgId,
                    locId,
                    serviceId,
                    staffId,
                    "2026-09-08T10:00:00.000Z",
                ),
            ).rejects.toThrow(ConflictException);
        });

        it("should reject slot during staff lunch break (13:00-14:00 UTC)", async () => {
            await expect(
                service.validateSlotForRead(
                    orgId,
                    locId,
                    serviceId,
                    staffId,
                    "2026-09-07T13:00:00.000Z",
                ),
            ).rejects.toThrow(ConflictException);
        });

        it("should reject slot during approved staff leave (2026-09-14)", async () => {
            await expect(
                service.validateSlotForRead(
                    orgId,
                    locId,
                    serviceId,
                    staffId,
                    "2026-09-14T10:00:00.000Z",
                ),
            ).rejects.toThrow(ConflictException);
        });
    });

    describe("2. Cross-Tenant Isolation Enforcement", () => {
        it("should reject booking with foreign Location ID", async () => {
            await expect(
                service.validateAndReserveSlot({
                    organizationId: orgId,
                    locationId: foreignLocId,
                    serviceId: serviceId,
                    startAt: validStartIso,
                    targetType: "HOLD",
                }),
            ).rejects.toThrow(NotFoundException);
        });

        it("should reject booking with foreign Service ID", async () => {
            await expect(
                service.validateAndReserveSlot({
                    organizationId: orgId,
                    locationId: locId,
                    serviceId: foreignServiceId,
                    startAt: validStartIso,
                    targetType: "HOLD",
                }),
            ).rejects.toThrow(NotFoundException);
        });

        it("should reject booking with foreign Customer ID", async () => {
            await expect(
                service.validateAndReserveSlot({
                    organizationId: orgId,
                    locationId: locId,
                    serviceId: serviceId,
                    customerId: foreignCustomerId,
                    startAt: validStartIso,
                    targetType: "HOLD",
                }),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe("3. Authoritative Hold Creation & Concurrency", () => {
        it("should create a valid BookingHold with server-computed expiration and outbox event", async () => {
            const res = await service.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: serviceId,
                staffId: staffId,
                customerId: customerId,
                startAt: validStartIso,
                targetType: "HOLD",
                holdDetails: {
                    guestName: "John Customer",
                    guestEmail: "john@example.com",
                },
            });

            expect(res.success).toBe(true);
            expect(res.bookingHold).toBeDefined();
            expect(res.bookingHold?.status).toBe("ACTIVE");
            expect(res.quoteSnapshot.priceCents).toBe(12000);
            expect(mockOutboxEvents).toHaveLength(1);
            expect(mockOutboxEvents[0].eventType).toBe("booking_hold.created");
        });

        it("should reject second conflicting hold reservation for the same slot (Single Capacity)", async () => {
            // First hold
            await service.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: serviceId,
                staffId: staffId,
                startAt: validStartIso,
                targetType: "HOLD",
            });

            // Second concurrent hold on same slot
            await expect(
                service.validateAndReserveSlot({
                    organizationId: orgId,
                    locationId: locId,
                    serviceId: serviceId,
                    staffId: staffId,
                    startAt: validStartIso,
                    targetType: "HOLD",
                }),
            ).rejects.toThrow(ConflictException);
        });
    });

    describe("4. Atomic Single Hold Conversion & Duplicate Detection", () => {
        it("should atomically convert an active hold into a confirmed appointment", async () => {
            // 1. Create Hold
            const holdRes = await service.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: serviceId,
                staffId: staffId,
                customerId: customerId,
                startAt: validStartIso,
                targetType: "HOLD",
            });

            const holdId = holdRes.bookingHold!.id;

            // 2. Convert Hold to Appointment
            const apptRes = await service.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: serviceId,
                staffId: staffId,
                customerId: customerId,
                startAt: validStartIso,
                targetType: "APPOINTMENT",
                appointmentDetails: {
                    bookingHoldId: holdId,
                    paymentStatus: "PAID",
                    bookingSource: "CUSTOMER_WEB",
                },
            });

            expect(apptRes.success).toBe(true);
            expect(apptRes.appointment).toBeDefined();
            expect(apptRes.appointment?.status).toBe("CONFIRMED");
            expect(apptRes.appointment?.paymentStatus).toBe("PAID");

            // Verify hold is CONVERTED in state
            const holdInDb = mockBookingHolds.find((h) => h.id === holdId);
            expect(holdInDb.status).toBe("CONVERTED");
        });

        it("should idempotently return existing appointment on duplicate hold conversion attempt", async () => {
            // 1. Create Hold
            const holdRes = await service.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: serviceId,
                staffId: staffId,
                customerId: customerId,
                startAt: validStartIso,
                targetType: "HOLD",
            });
            const holdId = holdRes.bookingHold!.id;

            // 2. First Conversion
            const firstApptRes = await service.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: serviceId,
                staffId: staffId,
                customerId: customerId,
                startAt: validStartIso,
                targetType: "APPOINTMENT",
                appointmentDetails: {
                    bookingHoldId: holdId,
                    paymentStatus: "PAID",
                },
            });

            // 3. Second Duplicate Conversion (e.g. duplicate webhook arrival)
            const secondApptRes = await service.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: serviceId,
                staffId: staffId,
                customerId: customerId,
                startAt: validStartIso,
                targetType: "APPOINTMENT",
                appointmentDetails: {
                    bookingHoldId: holdId,
                    paymentStatus: "PAID",
                },
            });

            expect(secondApptRes.success).toBe(true);
            expect(secondApptRes.appointment?.id).toBe(firstApptRes.appointment?.id);
            expect(mockAppointments).toHaveLength(1); // No duplicate appointment created
        });
    });

    describe("5. Rescheduling Collisions & Version Increment", () => {
        it("should reschedule an existing appointment to a new slot cleanly and increment version", async () => {
            // Create initial appointment
            const apptRes = await service.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: serviceId,
                staffId: staffId,
                customerId: customerId,
                startAt: validStartIso,
                targetType: "APPOINTMENT",
                appointmentDetails: { bookingSource: "STAFF_MANUAL" },
            });
            const apptId = apptRes.appointment!.id;

            // Reschedule to 11:00 UTC
            const newStartIso = "2026-09-07T11:00:00.000Z";
            const reschedRes = await service.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: serviceId,
                staffId: staffId,
                customerId: customerId,
                startAt: newStartIso,
                targetType: "APPOINTMENT",
                rescheduleAppointmentId: apptId,
            });

            expect(reschedRes.success).toBe(true);
            expect(reschedRes.appointment?.version).toBe(2);
        });

        it("should reject reschedule if target slot collides with an existing appointment", async () => {
            // Appointment A at 10:00
            const apptA = await service.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: serviceId,
                staffId: staffId,
                customerId: customerId,
                startAt: validStartIso,
                targetType: "APPOINTMENT",
            });

            // Appointment B at 11:00
            const apptB = await service.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: serviceId,
                staffId: staffId,
                customerId: customerId,
                startAt: "2026-09-07T11:00:00.000Z",
                targetType: "APPOINTMENT",
            });

            // Try to reschedule Appointment B into Appointment A's slot (10:00)
            await expect(
                service.validateAndReserveSlot({
                    organizationId: orgId,
                    locationId: locId,
                    serviceId: serviceId,
                    staffId: staffId,
                    customerId: customerId,
                    startAt: validStartIso,
                    targetType: "APPOINTMENT",
                    rescheduleAppointmentId: apptB.appointment!.id,
                }),
            ).rejects.toThrow(ConflictException);
        });
    });

    describe("6. Audited Staff Overrides", () => {
        it("should allow staff override outside operating hours when explicit reason is supplied", async () => {
            const earlyStartIso = "2026-09-07T06:00:00.000Z"; // Normally outside operating hours

            const res = await service.validateAndReserveSlot({
                organizationId: orgId,
                locationId: locId,
                serviceId: serviceId,
                staffId: staffId,
                customerId: customerId,
                startAt: earlyStartIso,
                targetType: "APPOINTMENT",
                override: {
                    actorType: "STAFF",
                    actorId: "stf-admin-1",
                    reason: "VIP early emergency consultation requested by doctor",
                },
            });

            expect(res.success).toBe(true);
            expect(res.appointment?.overrideReason).toBe(
                "VIP early emergency consultation requested by doctor",
            );
            expect(mockAuditLogs).toHaveLength(1);
            expect(mockAuditLogs[0].action).toBe("appointment.override");
            expect(mockAuditLogs[0].payload.reason).toBe(
                "VIP early emergency consultation requested by doctor",
            );
        });

        it("should reject override attempt if override reason is blank", async () => {
            await expect(
                service.validateAndReserveSlot({
                    organizationId: orgId,
                    locationId: locId,
                    serviceId: serviceId,
                    staffId: staffId,
                    customerId: customerId,
                    startAt: "2026-09-07T06:00:00.000Z",
                    targetType: "APPOINTMENT",
                    override: {
                        actorType: "STAFF",
                        actorId: "stf-admin-1",
                        reason: "   ",
                    },
                }),
            ).rejects.toThrow(BadRequestException);
        });
    });
});
