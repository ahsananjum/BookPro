import { Test, TestingModule } from "@nestjs/testing";
import { AuthoritativeAvailabilityValidatorService } from "./authoritative-availability-validator.service";
import { AvailabilityService } from "./availability.service";
import { AvailabilityValidatorService } from "./availability-validator.service";
import { PolicyResolver } from "./policy-resolver";
import { DurationCalculator } from "./duration-calculator";
import { EffectiveOperatingWindowBuilder } from "./effective-operating-window-builder";
import { StaffAvailabilityBuilder } from "./staff-availability-builder";
import { ResourceAvailabilityService } from "./resource-availability.service";
import { CapacityAvailabilityService } from "./capacity-availability.service";
import { ScheduleGuardService } from "../concurrency/schedule-guard.service";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../database/prisma.service";
import { AvailabilityQueryValidator } from "./availability-query-validator";
import { EligibleStaffResolver } from "./eligible-staff-resolver";
import { BusyIntervalRepository } from "./busy-interval-repository";
import { SlotGenerator } from "./slot-generator";
import { RedisService } from "@bookpro/server-core";
import { ConflictException } from "@nestjs/common";


describe("P0-04 Authoritative Availability & Commercial Terms Suite", () => {
    let authoritativeValidator: AuthoritativeAvailabilityValidatorService;
    let availabilityService: AvailabilityService;

    const orgId = "org-p004-1";
    const locId = "loc-p004-1";
    const serviceId = "srv-p004-1";
    const staffId = "stf-p004-1";

    const mondaySlotIso = "2026-09-07T10:00:00.000Z";

    const mockLocationWithTax = {
        id: locId,
        organizationId: orgId,
        name: "Zurich Flagship Center",
        timezone: "UTC",
        taxRatePct: 8.1, // 8.1% Swiss VAT
        operatingHours: [
            { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isClosed: false },
        ],
        locationHolidays: [],
        archivedAt: null,
    };

    const mockLocationNoOperatingHours = {
        id: "loc-unconfigured",
        organizationId: orgId,
        name: "Unconfigured Branch",
        timezone: "UTC",
        taxRatePct: null,
        operatingHours: null, // Unconfigured
        locationHolidays: [],
        archivedAt: null,
    };

    const mockService = {
        id: serviceId,
        organizationId: orgId,
        name: "Executive Styling",
        durationMin: 30,
        preBufferMin: 0,
        postBufferMin: 0,
        capacity: 1,
        minParticipants: 1,
        maxParticipants: 1,
        priceCents: 20000, // CHF 200.00
        depositType: "PERCENTAGE",
        depositValue: 25, // 25% deposit
        currency: "CHF",
        isActive: true,
        archivedAt: null,
    };

    const mockStaffProfile = {
        id: staffId,
        organizationId: orgId,
        displayName: "Master Stylist Marc",
        isActive: true,
        archivedAt: null,
        staffLocations: [{ locationId: locId }, { locationId: "loc-unconfigured" }],

        staffServices: [{ serviceId: serviceId, customPriceCents: 24000, customDurationMin: 30 }],
        availabilities: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
        breaks: [],
        leaves: [],
    };

    const mockPolicy = {
        id: "pol-1",
        organizationId: orgId,
        locationId: null,
        serviceId: null,
        minNoticeHours: 2,
        maxNoticeDays: 30,
        cancelCutoffHours: 48,
        cancelFeeType: "PERCENTAGE",
        cancelFeeValue: 50,
    };

    const mockPrisma: any = {
        location: {
            findFirst: jest.fn().mockImplementation(({ where }) => {
                if (where.id === locId) return Promise.resolve(mockLocationWithTax);
                if (where.id === "loc-unconfigured") return Promise.resolve(mockLocationNoOperatingHours);
                return Promise.resolve(null);
            }),
        },
        service: {
            findFirst: jest.fn().mockImplementation(({ where }) => {
                if (where.id === serviceId) return Promise.resolve(mockService);
                return Promise.resolve(null);
            }),
        },
        staffProfile: {
            findFirst: jest.fn().mockImplementation(({ where }) => {
                if (where.id === staffId) return Promise.resolve(mockStaffProfile);
                return Promise.resolve(null);
            }),
            findMany: jest.fn().mockResolvedValue([mockStaffProfile]),
        },
        policyConfig: {
            findFirst: jest.fn().mockResolvedValue(mockPolicy),
        },
        serviceResource: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        scheduleBlock: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        bookingHold: {
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
        },
        appointment: {
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
        },
        $transaction: jest.fn().mockImplementation(async (callback) => {
            const tx = {
                ...mockPrisma,
                $executeRawUnsafe: jest.fn().mockResolvedValue(1),
                bookingHold: {
                    create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "hold-p004-1", ...data })),
                    findFirst: jest.fn().mockResolvedValue(null),
                },
                appointment: {
                    create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "appt-p004-1", ...data })),
                },
                outboxEvent: {
                    create: jest.fn().mockResolvedValue({ id: "outbox-1" }),
                },
                auditLog: {
                    create: jest.fn().mockResolvedValue({ id: "audit-1" }),
                },
            };
            return callback(tx);
        }),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthoritativeAvailabilityValidatorService,
                AvailabilityService,
                AvailabilityValidatorService,
                PolicyResolver,
                DurationCalculator,
                EffectiveOperatingWindowBuilder,
                StaffAvailabilityBuilder,
                ResourceAvailabilityService,
                CapacityAvailabilityService,
                ScheduleGuardService,
                OutboxService,
                AvailabilityQueryValidator,
                EligibleStaffResolver,
                BusyIntervalRepository,
                SlotGenerator,
                { provide: PrismaService, useValue: mockPrisma },
                {
                    provide: RedisService,
                    useValue: {
                        get: jest.fn().mockResolvedValue(null),
                        set: jest.fn().mockResolvedValue(undefined),
                    },
                },
            ],

        }).compile();

        authoritativeValidator = module.get<AuthoritativeAvailabilityValidatorService>(AuthoritativeAvailabilityValidatorService);
        availabilityService = module.get<AvailabilityService>(AvailabilityService);
    });

    describe("1. No Operating Hours Fallback Elimination", () => {
        it("should reject booking slots with LOCATION_CLOSED when a location has no operating hours configured", async () => {
            await expect(
                authoritativeValidator.validateSlotForRead(
                    orgId,
                    "loc-unconfigured",
                    serviceId,
                    staffId,
                    mondaySlotIso,
                )
            ).rejects.toThrow(ConflictException);
        });

        it("should return 0 candidate slots when searching availability for an unconfigured location", async () => {
            const result = await availabilityService.searchAvailability({
                organizationId: orgId,
                locationId: "loc-unconfigured",
                serviceId: serviceId,
                startDate: "2026-09-07",
                endDate: "2026-09-07",
                partySize: 1,
            });

            expect(result.totalAvailableSlots).toBe(0);
            expect(result.slots).toHaveLength(0);
        });
    });

    describe("2. Authoritative Commercial Calculations & Currency", () => {
        it("should compute authoritative subtotal, tax, deposit, and dynamic cancellation policy", async () => {
            const res = await authoritativeValidator.validateSlotForRead(
                orgId,
                locId,
                serviceId,
                staffId,
                mondaySlotIso,
            );

            expect(res.isAvailable).toBe(true);
            const quote = res.quoteSnapshot;

            // Custom staff price is 24000 (CHF 240.00)
            expect(quote.priceCents).toBe(24000);
            expect(quote.basePriceCents).toBe(20000);
            expect(quote.currency).toBe("CHF");

            // Tax calculation: 24000 * 8.1% = 1944 cents
            expect(quote.taxAmountCents).toBe(1944);

            // Total: 24000 + 1944 = 25944 cents
            // Deposit: 25% of 25944 = 6486 cents
            expect(quote.depositAmountCents).toBe(6486);
            expect(quote.payableNowCents).toBe(6486);
            expect(quote.remainingBalanceCents).toBe(25944 - 6486);

            // Dynamic Cancellation Policy
            expect(quote.cancellationPolicy).toBeDefined();
            expect(quote.cancellationPolicy?.cancelCutoffHours).toBe(48);
            expect(quote.cancellationPolicy?.cancelFeeType).toBe("PERCENTAGE");
            expect(quote.cancellationPolicy?.cancelFeeValue).toBe(50);
        });
    });

    describe("3. Honest Failure on Provider/Database Error", () => {
        it("should fail honestly with isAvailable: false and no fabricated slot times on error", async () => {
            mockPrisma.location.findFirst.mockRejectedValueOnce(new Error("Database connection timeout"));

            const res = await availabilityService.validateAvailability({
                organizationId: orgId,
                locationId: locId,
                serviceId: serviceId,
                staffId: staffId,
                startTime: mondaySlotIso,
                partySize: 1,
            });

            expect(res.isAvailable).toBe(false);
            expect(res.reason).toContain("Database connection timeout");
            expect(res.availableCapacity).toBe(0);
        });
    });
});
