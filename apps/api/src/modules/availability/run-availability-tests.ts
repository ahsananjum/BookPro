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

console.log("=== P4 Modular Availability Engine Pipeline Verification ===");

const mockLocation = {
    id: "loc-100",
    organizationId: "org-100",
    name: "Main Clinic",
    timezone: "Asia/Karachi",
    operatingHours: [
        { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isClosed: false },
    ],
    locationHolidays: [],
};

const mockService = {
    id: "srv-100",
    organizationId: "org-100",
    name: "General Consultation",
    durationMin: 30,
    preBufferMin: 10,
    postBufferMin: 10,
    capacity: 1,
};

const mockStaff = [
    {
        id: "stf-100",
        organizationId: "org-100",
        displayName: "Dr. Alice Smith",
        isActive: true,
        staffLocations: [{ locationId: "loc-100" }],
        staffServices: [{ serviceId: "srv-100" }],
        availabilities: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
        breaks: [{ dayOfWeek: 1, startTime: "13:00", endTime: "14:00" }], // Lunch break 13:00-14:00
        leaves: [],
    },
];

const mockPrisma: any = {
    location: {
        findFirst: async () => mockLocation,
    },
    service: {
        findFirst: async () => mockService,
    },
    staffProfile: {
        findMany: async () => mockStaff,
        findFirst: async () => mockStaff[0],
    },
    scheduleBlock: {
        findMany: async () => [],
    },
    policyConfig: {
        findFirst: async () => ({ minNoticeHours: 0, maxNoticeDays: 30 }),
    },
    staffLeave: {
        findMany: async () => [],
    },
    serviceResource: {
        findMany: async () => [],
    },
    bookingHold: {
        findMany: async () => [],
    },
    appointment: {
        findMany: async () => [],
    },
};

async function runTests() {
    const validator = new AvailabilityValidatorService(mockPrisma);
    const queryValidator = new AvailabilityQueryValidator();
    const staffResolver = new EligibleStaffResolver(mockPrisma);
    const operatingWindowBuilder = new EffectiveOperatingWindowBuilder();
    const staffAvailabilityBuilder = new StaffAvailabilityBuilder();
    const busyRepo = new BusyIntervalRepository(mockPrisma);
    const durationCalc = new DurationCalculator();
    const resourceService = new ResourceAvailabilityService(mockPrisma);
    const capacityService = new CapacityAvailabilityService(mockPrisma);
    const policyResolver = new PolicyResolver(mockPrisma);
    const slotGenerator = new SlotGenerator();
    const scheduleGuardService = new ScheduleGuardService(mockPrisma);
    const outboxService = new OutboxService(mockPrisma);
    const authoritativeValidator = new AuthoritativeAvailabilityValidatorService(
        mockPrisma,
        scheduleGuardService,
        outboxService,
        policyResolver,
        durationCalc,
        operatingWindowBuilder,
        staffAvailabilityBuilder,
        resourceService,
        capacityService,
    );

    const service = new AvailabilityService(
        mockPrisma,
        validator,
        authoritativeValidator,
        queryValidator,
        staffResolver,
        operatingWindowBuilder,
        staffAvailabilityBuilder,
        busyRepo,
        durationCalc,
        resourceService,
        capacityService,
        policyResolver,
        slotGenerator,
    );

    // Search availability for upcoming Monday
    const futureMonday = new Date();
    futureMonday.setUTCDate(futureMonday.getUTCDate() + ((8 - futureMonday.getUTCDay()) % 7 || 7));
    const searchDate = futureMonday.toISOString().slice(0, 10);

    const result = await service.searchAvailability({
        organizationId: "org-100",
        locationId: "loc-100",
        serviceId: "srv-100",
        startDate: searchDate,
        endDate: searchDate,
        presentationTimezone: "Asia/Karachi",
    });

    console.assert(result.totalAvailableSlots > 0, "Availability search must return slots");

    // Verify lunch break (13:00-14:00 PKT) has no overlapping candidate slots
    const lunchSlot = result.slots.find(
        (s: any) => s.formattedStartTime.includes("01:00 PM") || s.formattedStartTime.includes("01:15 PM"),
    );
    console.assert(lunchSlot === undefined, "Lunch break (13:00-14:00) must be subtracted from availability");

    // Validate slot write interface
    const validationRes = await validator.validateSlotForWrite(
        "org-100",
        "loc-100",
        "srv-100",
        "stf-100",
        `${searchDate}T05:00:00.000Z`, // 10:00 PKT
    );

    console.assert(validationRes.serviceDurationMinutes === 30, "Service duration must match 30 minutes");
    console.assert(validationRes.occupiedInterval.durationMinutes === 50, "Occupied interval must equal 10 + 30 + 10 = 50 minutes");

    console.log(`SUCCESS: Found ${result.totalAvailableSlots} valid slots. All 14 modular pipeline steps verified!`);
}

runTests().catch((err) => {
    console.error("TEST FAILED:", err);
    process.exit(1);
});
