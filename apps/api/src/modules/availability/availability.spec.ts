import { Test, TestingModule } from "@nestjs/testing";
import { AvailabilityService } from "./availability.service";
import { AvailabilityValidatorService } from "./availability-validator.service";
import { AvailabilityQueryValidator } from "./availability-query-validator";
import { EligibleStaffResolver } from "./eligible-staff-resolver";
import { EffectiveOperatingWindowBuilder } from "./effective-operating-window-builder";
import { StaffAvailabilityBuilder } from "./staff-availability-builder";
import { BusyIntervalRepository } from "./busy-interval-repository";
import { DurationCalculator } from "./duration-calculator";
import { ResourceAvailabilityService } from "./resource-availability.service";
import { CapacityAvailabilityService } from "./capacity-availability.service";
import { PolicyResolver } from "./policy-resolver";
import { SlotGenerator } from "./slot-generator";
import { AuthoritativeAvailabilityValidatorService } from "./authoritative-availability-validator.service";
import { ScheduleGuardService } from "../concurrency/schedule-guard.service";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../database/prisma.service";
import { BadRequestException } from "@nestjs/common";
import { RedisService } from "@bookpro/server-core";

describe("Availability Engine Comprehensive Suite", () => {
    let availabilityService: AvailabilityService;
    let validatorService: AvailabilityValidatorService;

    const mockLocation = {
        id: "loc-spec-1",
        organizationId: "org-spec-1",
        name: "Main Clinic",
        timezone: "Asia/Karachi",
        operatingHours: [
            { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isClosed: false },
        ],
        locationHolidays: [],
    };

    const mockService = {
        id: "srv-spec-1",
        organizationId: "org-spec-1",
        name: "Consultation",
        durationMin: 30,
        preBufferMin: 10,
        postBufferMin: 10,
        capacity: 2,
    };

    const mockStaff = [
        {
            id: "stf-spec-1",
            organizationId: "org-spec-1",
            displayName: "Dr. Alice",
            isActive: true,
            staffLocations: [{ locationId: "loc-spec-1" }],
            staffServices: [{ serviceId: "srv-spec-1" }],
            availabilities: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
            breaks: [{ dayOfWeek: 1, startTime: "13:00", endTime: "14:00" }],
            leaves: [],
        },
    ];

    const mockPrismaService = {
        location: {
            findFirst: jest.fn().mockResolvedValue(mockLocation),
        },
        service: {
            findFirst: jest.fn().mockResolvedValue(mockService),
        },
        staffProfile: {
            findMany: jest.fn().mockResolvedValue(mockStaff),
            findFirst: jest.fn().mockResolvedValue(mockStaff[0]),
        },
        scheduleBlock: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        policyConfig: {
            findFirst: jest.fn().mockResolvedValue({ minNoticeHours: 0, maxNoticeDays: 30 }),
        },
        serviceResource: {
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
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AvailabilityService,
                AvailabilityValidatorService,
                AuthoritativeAvailabilityValidatorService,
                ScheduleGuardService,
                OutboxService,
                AvailabilityQueryValidator,
                EligibleStaffResolver,
                EffectiveOperatingWindowBuilder,
                StaffAvailabilityBuilder,
                BusyIntervalRepository,
                DurationCalculator,
                ResourceAvailabilityService,
                CapacityAvailabilityService,
                PolicyResolver,
                SlotGenerator,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: RedisService, useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(false) } },
            ],
        }).compile();

        availabilityService = module.get<AvailabilityService>(AvailabilityService);
        validatorService = module.get<AvailabilityValidatorService>(AvailabilityValidatorService);
    });

    it("should be defined", () => {
        expect(availabilityService).toBeDefined();
        expect(validatorService).toBeDefined();
    });

    it("should throw error if date range exceeds 31 days", async () => {
        await expect(
            availabilityService.searchAvailability({
                organizationId: "org-spec-1",
                locationId: "loc-spec-1",
                serviceId: "srv-spec-1",
                startDate: "2026-08-01",
                endDate: "2026-09-15",
            }),
        ).rejects.toThrow(BadRequestException);
    });

    it("should return valid slots excluding lunch break", async () => {
        const futureMonday = new Date();
        futureMonday.setUTCDate(futureMonday.getUTCDate() + ((8 - futureMonday.getUTCDay()) % 7 || 7));
        const searchDate = futureMonday.toISOString().slice(0, 10);
        const res = await availabilityService.searchAvailability({
            organizationId: "org-spec-1",
            locationId: "loc-spec-1",
            serviceId: "srv-spec-1",
            startDate: searchDate,
            endDate: searchDate,
            presentationTimezone: "Asia/Karachi",
        });

        expect(res.totalAvailableSlots).toBeGreaterThan(0);
        const lunchSlot = res.slots.find((s) => s.formattedStartTime.includes("01:00 PM"));
        expect(lunchSlot).toBeUndefined();
    });
});
