import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import {
    SearchAvailabilityInput,
    SearchAvailabilityResponse,
    CandidateSlot,
    ValidateAvailabilityInput,
    ValidateAvailabilityResponse,
} from "@bookpro/contracts";
import { Instant, LocalDate, TimeInterval } from "@bookpro/server-core";
import { AvailabilityValidatorService } from "./availability-validator.service";
import { AuthoritativeAvailabilityValidatorService } from "./authoritative-availability-validator.service";
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
import { RedisService } from "@bookpro/server-core";

@Injectable()
export class AvailabilityService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly validatorService: AvailabilityValidatorService,
        private readonly authoritativeValidator: AuthoritativeAvailabilityValidatorService,
        private readonly queryValidator: AvailabilityQueryValidator,
        private readonly staffResolver: EligibleStaffResolver,
        private readonly operatingWindowBuilder: EffectiveOperatingWindowBuilder,
        private readonly staffAvailabilityBuilder: StaffAvailabilityBuilder,
        private readonly busyRepo: BusyIntervalRepository,
        private readonly durationCalc: DurationCalculator,
        private readonly resourceService: ResourceAvailabilityService,
        private readonly capacityService: CapacityAvailabilityService,
        private readonly policyResolver: PolicyResolver,
        private readonly slotGenerator: SlotGenerator,
        private readonly redisService?: RedisService,
    ) { }

    async searchAvailability(input: SearchAvailabilityInput): Promise<SearchAvailabilityResponse> {
        // Step 1: Validate Query Parameters
        const { startLocalDate, endLocalDate, presentationTimezone } =
            this.queryValidator.validateSearchInput(input);

        const {
            organizationId,
            locationId,
            serviceId,
            staffId: filterStaffId,
            partySize = 1,
            addonIds = [],
        } = input;

        // Redis Tenant-Scoped Availability Cache Check (Architecture §120 / PRD §63)
        const cacheKey = RedisService.buildKey(
            organizationId,
            "availability",
            locationId,
            serviceId,
            filterStaffId || "all",
            input.startDate,
            input.endDate,
            String(partySize),
            presentationTimezone
        );

        if (this.redisService) {
            const cached = await this.redisService.get<SearchAvailabilityResponse>(cacheKey);
            if (cached) {
                return cached;
            }
        }

        // Step 2: Resolve Location & Timezone
        const location = await this.prisma.location.findFirst({
            where: { id: locationId, organizationId, archivedAt: null },
            include: { locationHolidays: true },
        });
        if (!location) {
            throw new NotFoundException(`Location ${locationId} not found`);
        }

        const locationTimezone = location.timezone || "UTC";
        // Step 3: Fetch Service Details
        const service = await this.prisma.service.findFirst({
            where: { id: serviceId, organizationId, archivedAt: null, isActive: true },
        });
        if (!service) {
            throw new NotFoundException(`Service ${serviceId} not found or inactive`);
        }

        if (partySize > service.capacity) {
            throw new BadRequestException(
                `Requested party size ${partySize} exceeds service capacity ${service.capacity}`,
            );
        }

        // Step 4: Duration & Add-on Calculation
        const durationInfo = this.durationCalc.calculateDuration(
            service.durationMin,
            service.preBufferMin || 0,
            service.postBufferMin || 0,
            [], // Add-on durations
        );

        // Step 5: Resolve Eligible Staff
        const eligibleStaff = await this.staffResolver.resolveEligibleStaff(
            organizationId,
            locationId,
            serviceId,
            filterStaffId,
        );

        if (eligibleStaff.length === 0) {
            return {
                organizationId,
                locationId,
                serviceId,
                presentationTimezone,
                startDate: input.startDate,
                endDate: input.endDate,
                totalAvailableSlots: 0,
                slots: [],
            };
        }

        // Step 6: Query Policy Bounds
        const policy = await this.policyResolver.resolvePolicy(organizationId, locationId, serviceId);

        const slots: CandidateSlot[] = [];

        // Step 7: Iterate Day by Day
        const current = new Date(startLocalDate.toString());
        const end = new Date(endLocalDate.toString());

        while (current <= end) {
            const year = current.getUTCFullYear();
            const month = current.getUTCMonth() + 1;
            const day = current.getUTCDate();
            const dayLocalDate = new LocalDate(year, month, day);

            // Step 8: Build Effective Location Operating Windows
            const opWindows = this.operatingWindowBuilder.buildOperatingWindows(
                dayLocalDate,
                locationTimezone,
                location.operatingHours,
                location.locationHolidays,
            );

            if (opWindows.length > 0) {
                for (const staff of eligibleStaff) {
                    // Step 9: Build Staff Working Intervals
                    const workingIntervals = this.staffAvailabilityBuilder.buildStaffWorkingIntervals(
                        dayLocalDate,
                        locationTimezone,
                        opWindows,
                        staff.availabilities,
                        staff.breaks,
                        staff.leaves,
                        [], // Sched blocks handled in busy repo
                        staff.id,
                        locationId,
                    );

                    if (workingIntervals.length === 0) continue;

                    // Step 10: Query Busy Intervals (Appointments, Holds, Blocks)
                    const searchStart = Instant.fromDate(current);
                    const searchEnd = searchStart.addMinutes(24 * 60);

                    const busyIntervals = await this.busyRepo.fetchBusyIntervals(
                        organizationId,
                        locationId,
                        [staff.id],
                        searchStart,
                        searchEnd,
                    );

                    const busySubtrahends = TimeInterval.normalizeSet(
                        busyIntervals.map((b) => b.interval),
                    );

                    const availableStaffIntervals = TimeInterval.subtractSet(workingIntervals, busySubtrahends);
                    // Dynamically set slot stepping to the registered service duration + buffers from database
                    const stepMinutes = durationInfo.totalDurationMin > 0
                        ? durationInfo.totalDurationMin
                        : (service.durationMin || 30);

                    // Step 11: Candidate Slot Generation
                    const candidateSlots = this.slotGenerator.generateCandidateSlots(
                        availableStaffIntervals,
                        durationInfo.totalDurationMin,
                        durationInfo.preBufferMin,
                        durationInfo.postBufferMin,
                        stepMinutes,
                        policy.minNoticeInstant,
                        policy.maxNoticeInstant,
                        presentationTimezone,
                        locationId,
                        serviceId,
                        staff.id,
                        staff.displayName,
                        service.capacity,
                    );

                    // Step 12 & 13: Resource & Group Capacity Checking
                    for (const slot of candidateSlots) {
                        const candidateInt = new TimeInterval(
                            Instant.fromIso(slot.startTime),
                            Instant.fromIso(slot.endTime),
                        );

                        // Capacity Check
                        const capCheck = await this.capacityService.checkCapacity(
                            organizationId,
                            locationId,
                            serviceId,
                            candidateInt,
                            partySize,
                            service.capacity,
                        );

                        if (!capCheck.hasCapacity) continue;

                        // Resource Check
                        const resCheck = await this.resourceService.checkResourceAvailability(
                            organizationId,
                            locationId,
                            serviceId,
                            candidateInt,
                        );

                        if (resCheck.isAvailable) {
                            slots.push({
                                ...slot,
                                availableCapacity: capCheck.availableCapacity,
                                allocatedResourceIds: resCheck.allocatedResourceIds,
                            });
                        }
                    }
                }
            }

            current.setUTCDate(current.getUTCDate() + 1);
        }

        const response: SearchAvailabilityResponse = {
            organizationId,
            locationId,
            serviceId,
            presentationTimezone,
            startDate: input.startDate,
            endDate: input.endDate,
            totalAvailableSlots: slots.length,
            slots,
        };

        if (this.redisService) {
            // Non-authoritative 60-second read cache
            await this.redisService.set(cacheKey, response, 60);
        }

        return response;
    }

    async validateAvailability(input: ValidateAvailabilityInput): Promise<ValidateAvailabilityResponse> {
        try {
            const res = await this.authoritativeValidator.validateSlotForRead(
                input.organizationId,
                input.locationId,
                input.serviceId,
                input.staffId,
                input.startTime,
                input.partySize || 1,
                input.addonIds || [],
                input.resourceIds || [],
            );

            return {
                isAvailable: true,
                startTime: res.startAt.toIso(),
                endTime: res.endAt.toIso(),
                staffId: input.staffId || res.staffId || "",
                locationId: input.locationId,
                serviceId: input.serviceId,
                availableCapacity: res.availableCapacity,
            };
        } catch (err: any) {
            return {
                isAvailable: false,
                reason: err.message || err.response?.message || "Slot unavailable",
                startTime: input.startTime,
                endTime: input.startTime,
                staffId: input.staffId || "",
                locationId: input.locationId,
                serviceId: input.serviceId,
                availableCapacity: 0,
            };
        }
    }
}
