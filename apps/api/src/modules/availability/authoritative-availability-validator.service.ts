import {
    Injectable,
    Logger,
    NotFoundException,
    ConflictException,
    BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ScheduleGuardService, GuardKey } from "../concurrency/schedule-guard.service";
import { OutboxService } from "../outbox/outbox.service";
import { PolicyResolver } from "./policy-resolver";
import { DurationCalculator } from "./duration-calculator";
import { EffectiveOperatingWindowBuilder } from "./effective-operating-window-builder";
import { StaffAvailabilityBuilder } from "./staff-availability-builder";
import { ResourceAvailabilityService } from "./resource-availability.service";
import { CapacityAvailabilityService } from "./capacity-availability.service";
import { Instant, LocalDate, TimeInterval } from "@bookpro/server-core";
import { Appointment, BookingHold, Prisma } from "@prisma/client";
import { organizationBookingDate } from "../appointments/booking-date.util";

export interface ValidateAndReserveSlotInput {
    organizationId: string;
    locationId: string;
    serviceId: string;
    staffId?: string | null;
    customerId?: string | null;
    startAt: string | Date;
    partySize?: number;
    addonIds?: string[];
    requestedResourceIds?: string[];
    targetType: "HOLD" | "APPOINTMENT";
    holdDetails?: {
        guestName?: string | null;
        guestEmail?: string | null;
        guestPhone?: string | null;
        idempotencyKey?: string | null;
        createdById?: string | null;
    };
    appointmentDetails?: {
        bookingSource?: string; // CUSTOMER_WEB | STAFF_MANUAL | RECURRING_SERIES | AI | WAITLIST
        paymentStatus?: string;
        priceCents?: number;
        currency?: string;
        internalNotes?: string | null;
        overrideReason?: string | null;
        createdById?: string | null;
        bookingHoldId?: string | null;
        intakeResponses?: Array<{ intakeFormId: string; responses: Record<string, any> }>;
    };
    rescheduleAppointmentId?: string | null;
    override?: {
        reason: string;
        actorId: string;
        actorType: string;
        bypassedRules?: string[];
    };
}

export interface AuthoritativeQuoteSnapshot {
    serviceId: string;
    serviceName: string;
    priceCents: number;
    basePriceCents: number;
    staffOverrideCents?: number;
    depositAmountCents: number;
    taxAmountCents: number;
    taxBehavior?: string;
    taxRatePct?: number;
    payableNowCents: number;
    remainingBalanceCents: number;
    quoteVersion: number;
    currency: string;
    durationMinutes: number;
    startAt: string;
    endAt: string;
    calculatedAt: string;
    cancellationPolicy?: {
        cancelCutoffHours: number;
        cancelFeeType: string;
        cancelFeeValue: number;
        description?: string;
    };
}


export interface ValidateAndReserveSlotResult {
    success: boolean;
    startAt: Date;
    endAt: Date;
    serviceInterval: TimeInterval;
    occupiedInterval: TimeInterval;
    serviceDurationMin: number;
    totalDurationMin: number;
    quoteSnapshot: AuthoritativeQuoteSnapshot;
    allocatedResourceIds: string[];
    assignedStaffId: string | null;
    bookingHold?: BookingHold;
    appointment?: Appointment;
}

export interface ValidateSlotForReadResult {
    isAvailable: boolean;
    reason?: string;
    startAt: Instant;
    endAt: Instant;
    serviceDurationMinutes: number;
    totalDurationMinutes: number;
    occupiedInterval: TimeInterval;
    allocatedResourceIds: string[];
    staffId: string | null;
    locationId: string;
    serviceId: string;
    availableCapacity: number;
    quoteSnapshot: AuthoritativeQuoteSnapshot;
}

@Injectable()
export class AuthoritativeAvailabilityValidatorService {
    private readonly logger = new Logger(AuthoritativeAvailabilityValidatorService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly scheduleGuardService: ScheduleGuardService,
        private readonly outboxService: OutboxService,
        private readonly policyResolver: PolicyResolver,
        private readonly durationCalc: DurationCalculator,
        private readonly operatingWindowBuilder: EffectiveOperatingWindowBuilder,
        private readonly staffAvailabilityBuilder: StaffAvailabilityBuilder,
        private readonly resourceService: ResourceAvailabilityService,
        private readonly capacityService: CapacityAvailabilityService,
    ) { }

    private intervalEncloses(parent: TimeInterval, child: TimeInterval): boolean {
        return parent.start.isBeforeOrEqual(child.start) && parent.end.isAfterOrEqual(child.end);
    }

    /**
     * Read-only validation checking all authoritative availability rules without DB write or lock.
     * Used by AvailabilityService, AI proposal generation, and quote calculators.
     */
    async validateSlotForRead(
        organizationId: string,
        locationId: string,
        serviceId: string,
        staffId: string | null | undefined,
        startTimeIso: string | Date,
        partySize = 1,
        addonIds: string[] = [],
        requestedResourceIds: string[] = [],
    ): Promise<ValidateSlotForReadResult> {
        // 1. Verify tenant location
        const location = await this.prisma.location.findFirst({
            where: { id: locationId, organizationId, archivedAt: null },
            include: { locationHolidays: true },
        });
        if (!location) {
            throw new NotFoundException(`Location ${locationId} not found or inactive in organization`);
        }

        // 2. Verify tenant service
        const service = await this.prisma.service.findFirst({
            where: { id: serviceId, organizationId, archivedAt: null, isActive: true },
        });
        if (!service) {
            throw new NotFoundException(`Service ${serviceId} not found or inactive in organization`);
        }

        // 3. Validate Party Size
        if (partySize < service.minParticipants || partySize > service.maxParticipants) {
            throw new BadRequestException(
                `Requested party size ${partySize} must be between ${service.minParticipants} and ${service.maxParticipants}`,
            );
        }
        if (partySize > service.capacity) {
            throw new BadRequestException(
                `Requested party size ${partySize} exceeds maximum service capacity ${service.capacity}`,
            );
        }

        // 4. Verify staff qualifications & location assignments
        let resolvedStaffId = staffId || null;
        let staffCustomPrice: number | null = null;
        let staffCustomDuration: number | null = null;

        if (resolvedStaffId) {
            const staff = await this.prisma.staffProfile.findFirst({
                where: { id: resolvedStaffId, organizationId, archivedAt: null, isActive: true },
                include: {
                    staffServices: true,
                    staffLocations: true,
                    availabilities: true,
                    breaks: true,
                    leaves: { where: { status: "APPROVED" } },
                },
            });
            if (!staff) {
                throw new NotFoundException(`Staff profile ${resolvedStaffId} not found or inactive`);
            }
            const isAssigned = staff.staffLocations.some((l) => l.locationId === locationId);
            if (!isAssigned) {
                throw new BadRequestException(`Staff ${resolvedStaffId} is not assigned to location ${locationId}`);
            }
            const staffService = staff.staffServices.find((s) => s.serviceId === serviceId);
            if (!staffService) {
                throw new BadRequestException(`Staff ${resolvedStaffId} is not qualified for service ${serviceId}`);
            }
            staffCustomPrice = staffService.customPriceCents;
            staffCustomDuration = staffService.customDurationMin;
        }

        // 5. Server-Authoritative Duration & Interval Calculation
        const effectiveServiceDuration = staffCustomDuration ?? service.durationMin;
        const durationInfo = this.durationCalc.calculateDuration(
            effectiveServiceDuration,
            service.preBufferMin || 0,
            service.postBufferMin || 0,
            [], // Addons
        );

        const startInstant = startTimeIso instanceof Date ? Instant.fromDate(startTimeIso) : Instant.fromIso(startTimeIso);
        const intervals = this.durationCalc.computeIntervals(startInstant, durationInfo);
        const serviceInterval = intervals.serviceInterval;
        const occupiedInterval = intervals.occupiedInterval;

        // 6. Policy Notice Windows
        const policy = await this.policyResolver.resolvePolicy(organizationId, locationId, serviceId);
        const now = Instant.now();

        if (startInstant.isBefore(policy.minNoticeInstant)) {
            throw new ConflictException({
                code: "MIN_NOTICE_VIOLATION",
                message: `Booking requires at least ${policy.minNoticeHours} hours advance notice.`,
            });
        }
        if (startInstant.isAfter(policy.maxNoticeInstant)) {
            throw new ConflictException({
                code: "MAX_NOTICE_VIOLATION",
                message: `Booking cannot be made more than ${policy.maxNoticeDays} days in advance.`,
            });
        }

        // 7. Location Operating Hours & Holidays
        const locationTimezone = location.timezone || "UTC";
        const startDateUtc = startInstant.toDate();
        const startLocalDate = new LocalDate(
            startDateUtc.getUTCFullYear(),
            startDateUtc.getUTCMonth() + 1,
            startDateUtc.getUTCDate(),
        );

        const opWindows = this.operatingWindowBuilder.buildOperatingWindows(
            startLocalDate,
            locationTimezone,
            location.operatingHours,
            location.locationHolidays || [],
        );

        const fallsWithinOperatingHours = opWindows.some((w) => this.intervalEncloses(w, occupiedInterval));
        if (!fallsWithinOperatingHours && opWindows.length > 0) {
            // Also check previous/next day in case of timezone/DST boundary
            const fitsAnyWindow = opWindows.some((w) => this.intervalEncloses(w, occupiedInterval));
            if (!fitsAnyWindow) {
                throw new ConflictException({
                    code: "OUTSIDE_OPERATING_HOURS",
                    message: "The requested time slot falls outside location operating hours or during a holiday.",
                });
            }
        } else if (opWindows.length === 0) {
            throw new ConflictException({
                code: "LOCATION_CLOSED",
                message: "Location is closed on the requested date.",
            });
        }

        // 8. Staff Working Hours, Breaks, Leaves, and Schedule Blocks
        if (resolvedStaffId) {
            const staff = await this.prisma.staffProfile.findFirst({
                where: { id: resolvedStaffId, organizationId, archivedAt: null, isActive: true },
                include: {
                    availabilities: true,
                    breaks: true,
                    leaves: { where: { status: "APPROVED" } },
                    scheduleBlocks: true,
                },
            });

            if (staff) {
                const workingIntervals = this.staffAvailabilityBuilder.buildStaffWorkingIntervals(
                    startLocalDate,
                    locationTimezone,
                    opWindows,
                    staff.availabilities,
                    staff.breaks,
                    staff.leaves,
                    staff.scheduleBlocks,
                    staff.id,
                );

                const isWithinStaffWorking = workingIntervals.some((wi) => this.intervalEncloses(wi, occupiedInterval));
                if (!isWithinStaffWorking) {
                    throw new ConflictException({
                        code: "STAFF_UNAVAILABLE",
                        message: `Staff member ${staff.displayName} is unavailable during the requested time.`,
                    });
                }
            }
        }

        // 9. Check Conflicting Confirmed Appointments & Active BookingHolds
        const overlappingAppts = await this.prisma.appointment.count({
            where: {
                organizationId,
                locationId,
                status: { in: ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] },
                ...(resolvedStaffId ? { staffId: resolvedStaffId } : {}),
                startAt: { lt: occupiedInterval.end.toDate() },
                endAt: { gt: occupiedInterval.start.toDate() },
            },
        });

        const nowUtc = new Date();
        const overlappingHolds = await this.prisma.bookingHold.count({
            where: {
                organizationId,
                locationId,
                status: "ACTIVE",
                expiresAt: { gt: nowUtc },
                ...(resolvedStaffId ? { staffId: resolvedStaffId } : {}),
                startAt: { lt: occupiedInterval.end.toDate() },
                endAt: { gt: occupiedInterval.start.toDate() },
            },
        });

        if (service.capacity === 1 && (overlappingAppts > 0 || overlappingHolds > 0)) {
            throw new ConflictException({
                code: "SLOT_UNAVAILABLE",
                message: "This time slot is already reserved or held by another customer.",
            });
        }

        // 10. Check Group Capacity Consumption
        let availableCapacity = service.capacity;
        if (service.capacity > 1) {
            const capCheck = await this.capacityService.checkCapacity(
                organizationId,
                locationId,
                serviceId,
                occupiedInterval,
                partySize,
                service.capacity,
            );
            if (!capCheck.hasCapacity) {
                throw new ConflictException({
                    code: "CAPACITY_EXCEEDED",
                    message: capCheck.reason || "Insufficient capacity for the requested party size.",
                });
            }
            availableCapacity = capCheck.availableCapacity;
        }

        // 11. Resource Availability Check
        const resCheck = await this.resourceService.checkResourceAvailability(
            organizationId,
            locationId,
            serviceId,
            occupiedInterval,
            requestedResourceIds,
        );
        if (!resCheck.isAvailable) {
            throw new ConflictException({
                code: "RESOURCE_UNAVAILABLE",
                message: resCheck.reason || "Required resources are unavailable for this slot.",
            });
        }

        // 12. Construct Authoritative Quote Snapshot
        const basePrice = service.priceCents;
        const finalPrice = staffCustomPrice ?? basePrice;
        const taxRatePct = (location as any).taxRatePct !== null && (location as any).taxRatePct !== undefined
            ? Number((location as any).taxRatePct)
            : 0;

        const taxBehavior = (service.taxBehavior as "EXCLUSIVE" | "INCLUSIVE" | "NONE") || "EXCLUSIVE";
        let taxAmountCents = 0;
        if (taxBehavior === "NONE" || taxRatePct <= 0) {
            taxAmountCents = 0;
        } else if (taxBehavior === "INCLUSIVE") {
            taxAmountCents = Math.round(finalPrice - (finalPrice / (1 + taxRatePct / 100)));
        } else {
            taxAmountCents = Math.round((finalPrice * taxRatePct) / 100);
        }

        const totalAmountCents = taxBehavior === "EXCLUSIVE" ? finalPrice + taxAmountCents : finalPrice;

        let depositCents = 0;
        if (service.depositType === "FIXED" || service.depositType === "FIXED_AMOUNT") {
            depositCents = Math.min(service.depositValue || 0, totalAmountCents);
        } else if (service.depositType === "PERCENTAGE") {
            const pct = (service.depositValue || 0) <= 100 ? (service.depositValue || 0) : (service.depositValue || 0) / 100;
            depositCents = Math.round((totalAmountCents * pct) / 100);
        } else if (service.depositType === "NONE") {
            depositCents = 0;
        }

        const isZeroDeposit = service.depositType === "NONE" || depositCents === 0;
        const payableNowCents = isZeroDeposit ? 0 : depositCents;
        const remainingBalanceCents = isZeroDeposit ? totalAmountCents : Math.max(0, totalAmountCents - depositCents);

        const cancellationPolicy = {
            cancelCutoffHours: policy.cancelCutoffHours,
            cancelFeeType: policy.cancelFeeType,
            cancelFeeValue: policy.cancelFeeValue,
            description: policy.cancelFeeType === "PERCENTAGE"
                ? `Cancellations made at least ${policy.cancelCutoffHours} hours in advance receive a full refund. Late cancellations incur a ${policy.cancelFeeValue}% fee.`
                : policy.cancelFeeType === "FIXED_AMOUNT"
                ? `Cancellations made at least ${policy.cancelCutoffHours} hours in advance receive a full refund. Late cancellations incur a fee of $${(policy.cancelFeeValue / 100).toFixed(2)}.`
                : `Cancellations must be made at least ${policy.cancelCutoffHours} hours prior to the scheduled start time.`
        };

        const quoteSnapshot: AuthoritativeQuoteSnapshot = {
            serviceId: service.id,
            serviceName: service.name,
            priceCents: finalPrice,
            basePriceCents: basePrice,
            staffOverrideCents: staffCustomPrice ?? undefined,
            depositAmountCents: depositCents,
            taxAmountCents,
            taxBehavior,
            taxRatePct,
            payableNowCents,
            remainingBalanceCents,
            quoteVersion: 1,
            currency: service.currency || "USD",
            durationMinutes: effectiveServiceDuration,
            startAt: serviceInterval.start.toIso(),
            endAt: serviceInterval.end.toIso(),
            calculatedAt: new Date().toISOString(),
            cancellationPolicy,
        };


        return {
            isAvailable: true,
            startAt: serviceInterval.start,
            endAt: serviceInterval.end,
            serviceDurationMinutes: effectiveServiceDuration,
            totalDurationMinutes: durationInfo.totalDurationMin,
            occupiedInterval,
            allocatedResourceIds: resCheck.allocatedResourceIds,
            staffId: resolvedStaffId,
            locationId,
            serviceId,
            availableCapacity,
            quoteSnapshot,
        };
    }

    /**
     * The single authoritative application use case for validating and reserving slots.
     * Executes entirely within a PostgreSQL transaction under deterministic pessimistic locks.
     */
    async validateAndReserveSlot(
        input: ValidateAndReserveSlotInput,
        existingTx?: Prisma.TransactionClient,
    ): Promise<ValidateAndReserveSlotResult> {
        const execute = async (tx: Prisma.TransactionClient): Promise<ValidateAndReserveSlotResult> => {
            const {
                organizationId,
                locationId,
                serviceId,
                staffId,
                customerId,
                partySize = 1,
                addonIds = [],
                requestedResourceIds = [],
                targetType,
                holdDetails,
                appointmentDetails,
                rescheduleAppointmentId,
                override,
            } = input;

            // Step 1: In-Transaction Composite Tenant Ownership Verification
            const location = await tx.location.findFirst({
                where: { id: locationId, organizationId, archivedAt: null },
                include: { locationHolidays: true },
            });
            if (!location) {
                throw new NotFoundException(`Location ${locationId} not found or does not belong to organization`);
            }

            const service = await tx.service.findFirst({
                where: { id: serviceId, organizationId, archivedAt: null, isActive: true },
            });
            if (!service) {
                throw new NotFoundException(`Service ${serviceId} not found or inactive in organization`);
            }

            // Validate Customer Ownership if provided
            if (customerId) {
                const customer = await tx.customer.findFirst({
                    where: { id: customerId, organizationId },
                });
                if (!customer) {
                    throw new NotFoundException(`Customer ${customerId} does not belong to organization`);
                }
            }

            // Validate Staff Qualifications & Location Assignment
            let staffCustomPrice: number | null = null;
            let staffCustomDuration: number | null = null;
            let resolvedStaffProfile: any = null;

            if (staffId) {
                resolvedStaffProfile = await tx.staffProfile.findFirst({
                    where: { id: staffId, organizationId, archivedAt: null, isActive: true },
                    include: {
                        staffServices: true,
                        staffLocations: true,
                        availabilities: true,
                        breaks: true,
                        leaves: { where: { status: "APPROVED" } },
                    },
                });
                if (!resolvedStaffProfile) {
                    throw new NotFoundException(`Staff ${staffId} not found or inactive in organization`);
                }
                const isAssigned = resolvedStaffProfile.staffLocations.some((l: any) => l.locationId === locationId);
                if (!isAssigned) {
                    throw new BadRequestException(`Staff ${staffId} is not assigned to location ${locationId}`);
                }
                const staffService = resolvedStaffProfile.staffServices.find((s: any) => s.serviceId === serviceId);
                if (!staffService) {
                    throw new BadRequestException(`Staff ${staffId} is not qualified for service ${serviceId}`);
                }
                staffCustomPrice = staffService.customPriceCents;
                staffCustomDuration = staffService.customDurationMin;
            }

            // Step 2: Server-Authoritative Duration & Price Calculation
            if (partySize < service.minParticipants || partySize > service.maxParticipants || partySize > service.capacity) {
                throw new BadRequestException(
                    `Requested party size ${partySize} violates service limits [${service.minParticipants} - ${service.maxParticipants}, max cap ${service.capacity}]`,
                );
            }

            const effectiveServiceDuration = staffCustomDuration ?? service.durationMin;
            const durationInfo = this.durationCalc.calculateDuration(
                effectiveServiceDuration,
                service.preBufferMin || 0,
                service.postBufferMin || 0,
                [],
            );

            const startInstant = input.startAt instanceof Date ? Instant.fromDate(input.startAt) : Instant.fromIso(input.startAt);
            const intervals = this.durationCalc.computeIntervals(startInstant, durationInfo);
            const serviceInterval = intervals.serviceInterval;
            const occupiedInterval = intervals.occupiedInterval;
            const startDate = serviceInterval.start.toDate();
            const endDate = serviceInterval.end.toDate();
            const bookingDate = organizationBookingDate(startDate, (location as any).timezone || "UTC");

            // One active appointment per customer per organization-local calendar day.
            if (customerId && targetType === "APPOINTMENT") {
                const existingDailyBooking = await tx.appointment.findFirst({
                    where: { organizationId, customerId, bookingDate, status: { notIn: ["CANCELLED", "NO_SHOW"] }, ...(rescheduleAppointmentId ? { id: { not: rescheduleAppointmentId } } : {}) },
                    select: { id: true },
                });
                if (existingDailyBooking) throw new ConflictException({ code: "CUSTOMER_DAILY_LIMIT", message: "A customer can book only one appointment per day." });
            }

            // Calculate Authoritative Pricing Quote Snapshot
            const basePrice = service.priceCents;
            const finalPrice = staffCustomPrice ?? basePrice;
            const taxRatePct = (location as any).taxRatePct !== null && (location as any).taxRatePct !== undefined
                ? Number((location as any).taxRatePct)
                : 0;

            const taxBehavior = (service.taxBehavior as "EXCLUSIVE" | "INCLUSIVE" | "NONE") || "EXCLUSIVE";
            let taxAmountCents = 0;
            if (taxBehavior === "NONE" || taxRatePct <= 0) {
                taxAmountCents = 0;
            } else if (taxBehavior === "INCLUSIVE") {
                taxAmountCents = Math.round(finalPrice - (finalPrice / (1 + taxRatePct / 100)));
            } else {
                taxAmountCents = Math.round((finalPrice * taxRatePct) / 100);
            }

            const totalAmountCents = taxBehavior === "EXCLUSIVE" ? finalPrice + taxAmountCents : finalPrice;

            let depositCents = 0;
            if (service.depositType === "FIXED" || service.depositType === "FIXED_AMOUNT") {
                depositCents = Math.min(service.depositValue || 0, totalAmountCents);
            } else if (service.depositType === "PERCENTAGE") {
                const pct = (service.depositValue || 0) <= 100 ? (service.depositValue || 0) : (service.depositValue || 0) / 100;
                depositCents = Math.round((totalAmountCents * pct) / 100);
            } else if (service.depositType === "NONE") {
                depositCents = 0;
            }

            const isZeroDeposit = service.depositType === "NONE" || depositCents === 0;
            const payableNowCents = isZeroDeposit ? 0 : depositCents;
            const remainingBalanceCents = isZeroDeposit ? totalAmountCents : Math.max(0, totalAmountCents - depositCents);

            const policy = await this.policyResolver.resolvePolicy(organizationId, locationId, serviceId);
            const cancellationPolicy = {
                cancelCutoffHours: policy.cancelCutoffHours,
                cancelFeeType: policy.cancelFeeType,
                cancelFeeValue: policy.cancelFeeValue,
                description: policy.cancelFeeType === "PERCENTAGE"
                    ? `Cancellations made at least ${policy.cancelCutoffHours} hours in advance receive a full refund. Late cancellations incur a ${policy.cancelFeeValue}% fee.`
                    : policy.cancelFeeType === "FIXED_AMOUNT"
                    ? `Cancellations made at least ${policy.cancelCutoffHours} hours in advance receive a full refund. Late cancellations incur a fee of $${(policy.cancelFeeValue / 100).toFixed(2)}.`
                    : `Cancellations must be made at least ${policy.cancelCutoffHours} hours prior to the scheduled start time.`
            };

            const quoteSnapshot: AuthoritativeQuoteSnapshot = {
                serviceId: service.id,
                serviceName: service.name,
                priceCents: finalPrice,
                basePriceCents: basePrice,
                staffOverrideCents: staffCustomPrice ?? undefined,
                depositAmountCents: depositCents,
                taxAmountCents,
                taxBehavior,
                taxRatePct,
                payableNowCents,
                remainingBalanceCents,
                quoteVersion: 1,
                currency: service.currency || "USD",
                durationMinutes: effectiveServiceDuration,
                startAt: serviceInterval.start.toIso(),
                endAt: serviceInterval.end.toIso(),
                calculatedAt: new Date().toISOString(),
                cancellationPolicy,
            };


            // Step 3: Resolve All Contested Resources & Deterministic Pessimistic Locks
            const serviceResources = await tx.serviceResource.findMany({
                where: { serviceId },
                include: { resource: true, resourcePool: { include: { resources: true } } },
            });

            const allocatedResourceIds: string[] = [];
            for (const sr of serviceResources) {
                if (sr.resourceId) {
                    allocatedResourceIds.push(sr.resourceId);
                } else if (sr.resourcePoolId && sr.resourcePool) {
                    const poolRes = sr.resourcePool.resources.filter((r) => r.isActive && r.locationId === locationId && !r.archivedAt);
                    for (let i = 0; i < Math.min(sr.quantityRequired, poolRes.length); i++) {
                        allocatedResourceIds.push(poolRes[i].id);
                    }
                }
            }
            for (const rId of requestedResourceIds) {
                allocatedResourceIds.push(rId);
            }

            // Early idempotent recovery if hold was already converted into an appointment
            if (appointmentDetails?.bookingHoldId) {
                const existingAppt = await tx.appointment.findFirst({
                    where: { bookingHoldId: appointmentDetails.bookingHoldId, organizationId },
                });
                if (existingAppt) {
                    return {
                        success: true,
                        startAt: existingAppt.startAt,
                        endAt: existingAppt.endAt,
                        serviceInterval: new TimeInterval(Instant.fromDate(existingAppt.startAt), Instant.fromDate(existingAppt.endAt)),
                        occupiedInterval,
                        serviceDurationMin: effectiveServiceDuration,
                        totalDurationMin: durationInfo.totalDurationMin,
                        quoteSnapshot,
                        allocatedResourceIds: [],
                        assignedStaffId: existingAppt.staffId,
                        appointment: existingAppt,
                    };
                }
            }

            const guardKeys = this.scheduleGuardService.buildGuardKeys(
                organizationId,
                occupiedInterval.start.toDate(),
                occupiedInterval.end.toDate(),
                staffId || null,
                allocatedResourceIds,
                service.capacity > 1 ? serviceId : null,
            );

            // Acquire pessimistic row locks deterministically
            await this.scheduleGuardService.acquireGuardsInTx(tx, guardKeys);

            // Step 4: Exhaustive In-Lock Rule Validation (unless overridden with audit)
            if (!override) {
                // Notice Windows (Policy 3-tier precedence)
                if (startInstant.isBefore(policy.minNoticeInstant)) {

                    throw new ConflictException({
                        code: "MIN_NOTICE_VIOLATION",
                        message: `Booking requires at least ${policy.minNoticeHours} hours advance notice.`,
                    });
                }
                if (startInstant.isAfter(policy.maxNoticeInstant)) {
                    throw new ConflictException({
                        code: "MAX_NOTICE_VIOLATION",
                        message: `Booking cannot be made more than ${policy.maxNoticeDays} days in advance.`,
                    });
                }

                // Location Operating Hours & Holidays
                const locationTimezone = location.timezone || "UTC";
                const startLocalDate = new LocalDate(
                    startDate.getUTCFullYear(),
                    startDate.getUTCMonth() + 1,
                    startDate.getUTCDate(),
                );
                const opWindows = this.operatingWindowBuilder.buildOperatingWindows(
                    startLocalDate,
                    locationTimezone,
                    location.operatingHours,
                    location.locationHolidays || [],
                );

                const fitsOpWindow = opWindows.some((w) => this.intervalEncloses(w, occupiedInterval));
                if (!fitsOpWindow) {
                    throw new ConflictException({
                        code: "OUTSIDE_OPERATING_HOURS",
                        message: "The requested time slot falls outside location operating hours or holiday closure.",
                    });
                }

                // Staff Schedules, Breaks, Leaves, Blocks
                if (staffId && resolvedStaffProfile) {
                    const blocks = await tx.scheduleBlock.findMany({
                        where: { organizationId, OR: [{ staffId }, { locationId }] },
                    });

                    const workingIntervals = this.staffAvailabilityBuilder.buildStaffWorkingIntervals(
                        startLocalDate,
                        locationTimezone,
                        opWindows,
                        resolvedStaffProfile.availabilities,
                        resolvedStaffProfile.breaks,
                        resolvedStaffProfile.leaves,
                        blocks,
                        staffId,
                    );

                    const isWorking = workingIntervals.some((wi) => this.intervalEncloses(wi, occupiedInterval));
                    if (!isWorking) {
                        throw new ConflictException({
                            code: "STAFF_UNAVAILABLE",
                            message: `Staff member ${resolvedStaffProfile.displayName} is unavailable during the requested time.`,
                        });
                    }
                }

                // Check Conflicting Confirmed Appointments
                const conflictingAppt = await tx.appointment.findFirst({
                    where: {
                        organizationId,
                        locationId,
                        ...(rescheduleAppointmentId ? { id: { not: rescheduleAppointmentId } } : {}),
                        ...(appointmentDetails?.bookingHoldId ? { bookingHoldId: { not: appointmentDetails.bookingHoldId } } : {}),
                        status: { in: ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] },
                        ...(staffId ? { staffId } : {}),
                        startAt: { lt: occupiedInterval.end.toDate() },
                        endAt: { gt: occupiedInterval.start.toDate() },
                    },
                });

                if (conflictingAppt && service.capacity === 1) {
                    throw new ConflictException({
                        code: "SLOT_UNAVAILABLE",
                        message: "This time slot was just booked by another customer.",
                        retryable: true,
                    });
                }

                // Check Active Booking Holds (excluding hold being converted if any)
                const currentConvertingHoldId = appointmentDetails?.bookingHoldId || null;
                const conflictingHold = await tx.bookingHold.findFirst({
                    where: {
                        organizationId,
                        locationId,
                        ...(currentConvertingHoldId ? { id: { not: currentConvertingHoldId } } : {}),
                        status: "ACTIVE",
                        expiresAt: { gt: new Date() },
                        ...(staffId ? { staffId } : {}),
                        startAt: { lt: occupiedInterval.end.toDate() },
                        endAt: { gt: occupiedInterval.start.toDate() },
                    },
                });

                if (conflictingHold && service.capacity === 1) {
                    throw new ConflictException({
                        code: "SLOT_UNAVAILABLE",
                        message: "This time slot is temporarily held by another customer.",
                        retryable: true,
                    });
                }

                // Group Capacity Validation
                if (service.capacity > 1) {
                    const allAppts = await tx.appointment.findMany({
                        where: {
                            organizationId,
                            locationId,
                            serviceId,
                            ...(rescheduleAppointmentId ? { id: { not: rescheduleAppointmentId } } : {}),
                            status: { in: ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] },
                            startAt: { lt: occupiedInterval.end.toDate() },
                            endAt: { gt: occupiedInterval.start.toDate() },
                        },
                    });
                    const allHolds = await tx.bookingHold.findMany({
                        where: {
                            organizationId,
                            locationId,
                            serviceId,
                            ...(currentConvertingHoldId ? { id: { not: currentConvertingHoldId } } : {}),
                            status: "ACTIVE",
                            expiresAt: { gt: new Date() },
                            startAt: { lt: occupiedInterval.end.toDate() },
                            endAt: { gt: occupiedInterval.start.toDate() },
                        },
                    });

                    const consumed = allAppts.reduce((sum, a) => sum + (a.partySize || 1), 0) +
                        allHolds.reduce((sum, h) => sum + (h.partySize || 1), 0);

                    if (consumed + partySize > service.capacity) {
                        throw new ConflictException({
                            code: "CAPACITY_EXCEEDED",
                            message: `Requested party size ${partySize} exceeds remaining available capacity (${Math.max(0, service.capacity - consumed)} remaining).`,
                        });
                    }
                }
            } else {
                // Audited Override Check
                if (!override.reason || override.reason.trim().length === 0) {
                    throw new BadRequestException("An explicit override reason is mandatory when overriding scheduling rules.");
                }
                this.logger.warn(
                    `[OverrideApplied] Slot reserved with override: Org=${organizationId}, Actor=${override.actorId}, Reason='${override.reason}'`,
                );
            }

            // Step 5: Execute Target Write Under Lock
            let createdHold: BookingHold | undefined;
            let createdAppt: Appointment | undefined;

            if (targetType === "HOLD") {
                const policy = await this.policyResolver.resolvePolicy(organizationId, locationId, serviceId);
                const holdDurationMinutes = policy.holdDurationMinutes;
                const expiresAt = new Date(Date.now() + holdDurationMinutes * 60 * 1000);

                createdHold = await tx.bookingHold.create({
                    data: {
                        organizationId,
                        locationId,
                        serviceId,
                        staffId: staffId || null,
                        customerId: customerId || null,
                        guestName: holdDetails?.guestName || null,
                        guestEmail: holdDetails?.guestEmail || null,
                        guestPhone: holdDetails?.guestPhone || null,
                        startAt: startDate,
                        endAt: endDate,
                        partySize,
                        status: "ACTIVE",
                        expiresAt,
                        quoteSnapshot: quoteSnapshot as any,
                        resourceAllocations: allocatedResourceIds.length > 0 ? (allocatedResourceIds as any) : undefined,
                        idempotencyKey: holdDetails?.idempotencyKey || null,
                        createdById: holdDetails?.createdById || null,
                    },
                });

                // Transactional Outbox
                await this.outboxService.emitInTx(tx, {
                    aggregateType: "BookingHold",
                    aggregateId: createdHold.id,
                    eventType: "booking_hold.created",
                    payload: {
                        holdId: createdHold.id,
                        organizationId: createdHold.organizationId,
                        serviceId: createdHold.serviceId,
                        staffId: createdHold.staffId,
                        startAt: createdHold.startAt,
                        endAt: createdHold.endAt,
                        expiresAt: createdHold.expiresAt,
                    },
                });
            } else if (targetType === "APPOINTMENT") {
                if (rescheduleAppointmentId) {
                    // Reschedule existing appointment
                    const priorAppt = await tx.appointment.findFirst({
                        where: { id: rescheduleAppointmentId, organizationId },
                    });
                    if (!priorAppt) {
                        throw new NotFoundException(`Appointment ${rescheduleAppointmentId} not found`);
                    }

                    createdAppt = await tx.appointment.update({
                        where: { id: rescheduleAppointmentId },
                        data: {
                            startAt: startDate,
                            endAt: endDate,
                            bookingDate,
                            staffId: staffId || null,
                            locationId,
                            serviceId,
                            version: { increment: 1 },
                            overrideReason: override ? override.reason : priorAppt.overrideReason,
                        },
                    });

                    await tx.appointmentHistory.create({
                        data: {
                            appointmentId: createdAppt.id,
                            actorType: override?.actorType || "STAFF",
                            actorId: override?.actorId || "SYSTEM",
                            action: "RESCHEDULED",
                            fromStatus: priorAppt.status,
                            toStatus: createdAppt.status,
                            changes: {
                                oldStartAt: priorAppt.startAt,
                                oldEndAt: priorAppt.endAt,
                                newStartAt: startDate,
                                newEndAt: endDate,
                                overrideReason: override?.reason || null,
                            },
                        },
                    });

                    await this.outboxService.emitInTx(tx, {
                        aggregateType: "Appointment",
                        aggregateId: createdAppt.id,
                        eventType: "appointment.rescheduled",
                        payload: {
                            appointmentId: createdAppt.id,
                            organizationId: createdAppt.organizationId,
                            startAt: createdAppt.startAt,
                            endAt: createdAppt.endAt,
                            staffId: createdAppt.staffId,
                        },
                    });
                } else if (appointmentDetails?.bookingHoldId) {
                    // Atomic single hold conversion
                    const holdId = appointmentDetails.bookingHoldId;
                    const updatedHold = await tx.bookingHold.updateMany({
                        where: {
                            id: holdId,
                            organizationId,
                            status: "ACTIVE",
                            expiresAt: { gt: new Date() },
                        },
                        data: { status: "CONVERTED" },
                    });

                    if (updatedHold.count === 0) {
                        const existingAppt = await tx.appointment.findFirst({
                            where: { bookingHoldId: holdId, organizationId },
                        });
                        if (existingAppt) {
                            return {
                                success: true,
                                startAt: existingAppt.startAt,
                                endAt: existingAppt.endAt,
                                serviceInterval: new TimeInterval(Instant.fromDate(existingAppt.startAt), Instant.fromDate(existingAppt.endAt)),
                                occupiedInterval,
                                serviceDurationMin: effectiveServiceDuration,
                                totalDurationMin: durationInfo.totalDurationMin,
                                quoteSnapshot,
                                allocatedResourceIds,
                                assignedStaffId: existingAppt.staffId,
                                appointment: existingAppt,
                            };
                        }
                        throw new BadRequestException("Booking hold has expired or is no longer active.");
                    }

                    createdAppt = await tx.appointment.create({
                        data: {
                            organizationId,
                            locationId,
                            serviceId,
                            staffId: staffId || null,
                            customerId: customerId!,
                            bookingHoldId: holdId,
                            startAt: startDate,
                            endAt: endDate,
                            bookingDate,
                            partySize,
                            status: "CONFIRMED",
                            paymentStatus: appointmentDetails.paymentStatus || "UNPAID",
                            bookingSource: appointmentDetails.bookingSource || "CUSTOMER_WEB",
                            priceCents: quoteSnapshot.priceCents,
                            currency: quoteSnapshot.currency,
                            internalNotes: appointmentDetails.internalNotes || null,
                            overrideReason: override ? override.reason : null,
                            version: 1,
                        },
                    });

                    // Increment coupon usage count atomically with usage limit check
                    const couponCode = (quoteSnapshot as any)?.appliedCouponCode;
                    if (couponCode) {
                        const cpn = await tx.coupon.findFirst({
                            where: { organizationId, code: couponCode, isActive: true },
                        });
                        if (cpn) {
                            if (cpn.usageLimit !== null && cpn.usageLimit !== undefined) {
                                await tx.coupon.updateMany({
                                    where: {
                                        id: cpn.id,
                                        usageCount: { lt: cpn.usageLimit },
                                    },
                                    data: { usageCount: { increment: 1 } },
                                });
                            } else {
                                await tx.coupon.update({
                                    where: { id: cpn.id },
                                    data: { usageCount: { increment: 1 } },
                                });
                            }
                        }
                    }

                    // Link allocated resources
                    for (const rId of allocatedResourceIds) {
                        await tx.appointmentResource.create({
                            data: {
                                appointmentId: createdAppt.id,
                                resourceId: rId,
                                quantity: 1,
                            },
                        });
                    }

                    // Intake responses
                    if (appointmentDetails.intakeResponses && Array.isArray(appointmentDetails.intakeResponses)) {
                        for (const resp of appointmentDetails.intakeResponses) {
                            if (resp.intakeFormId && resp.responses) {
                                await tx.intakeResponse.create({
                                    data: {
                                        appointmentId: createdAppt.id,
                                        intakeFormId: resp.intakeFormId,
                                        responses: resp.responses,
                                    },
                                });
                            }
                        }
                    }

                    await tx.appointmentHistory.create({
                        data: {
                            appointmentId: createdAppt.id,
                            actorType: override?.actorType || "CUSTOMER",
                            actorId: customerId || "GUEST",
                            action: "CREATED",
                            fromStatus: null,
                            toStatus: "CONFIRMED",
                            changes: { bookingHoldId: holdId, overrideReason: override?.reason || null },
                        },
                    });

                    await this.outboxService.emitInTx(tx, {
                        aggregateType: "Appointment",
                        aggregateId: createdAppt.id,
                        eventType: "appointment.created",
                        payload: {
                            appointmentId: createdAppt.id,
                            organizationId: createdAppt.organizationId,
                            bookingHoldId: holdId,
                        },
                    });
                } else {
                    // Direct / Manual appointment creation
                    createdAppt = await tx.appointment.create({
                        data: {
                            organizationId,
                            locationId,
                            serviceId,
                            staffId: staffId || null,
                            customerId: customerId!,
                            startAt: startDate,
                            endAt: endDate,
                            bookingDate,
                            partySize,
                            status: "CONFIRMED",
                            paymentStatus: appointmentDetails?.paymentStatus || "UNPAID",
                            bookingSource: appointmentDetails?.bookingSource || "STAFF_MANUAL",
                            priceCents: quoteSnapshot.priceCents,
                            currency: quoteSnapshot.currency,
                            internalNotes: appointmentDetails?.internalNotes || null,
                            overrideReason: override ? override.reason : null,
                            version: 1,
                        },
                    });

                    // Link allocated resources
                    for (const rId of allocatedResourceIds) {
                        await tx.appointmentResource.create({
                            data: {
                                appointmentId: createdAppt.id,
                                resourceId: rId,
                                quantity: 1,
                            },
                        });
                    }

                    // Intake responses
                    if (appointmentDetails?.intakeResponses && Array.isArray(appointmentDetails.intakeResponses)) {
                        for (const resp of appointmentDetails.intakeResponses) {
                            if (resp.intakeFormId && resp.responses) {
                                await tx.intakeResponse.create({
                                    data: {
                                        appointmentId: createdAppt.id,
                                        intakeFormId: resp.intakeFormId,
                                        responses: resp.responses,
                                    },
                                });
                            }
                        }
                    }

                    await tx.appointmentHistory.create({
                        data: {
                            appointmentId: createdAppt.id,
                            actorType: override?.actorType || "STAFF",
                            actorId: override?.actorId || appointmentDetails?.createdById || "SYSTEM",
                            action: "CREATED",
                            fromStatus: null,
                            toStatus: "CONFIRMED",
                            changes: {
                                source: appointmentDetails?.bookingSource || "STAFF_MANUAL",
                                overrideReason: override?.reason || null,
                            },
                        },
                    });

                    await this.outboxService.emitInTx(tx, {
                        aggregateType: "Appointment",
                        aggregateId: createdAppt.id,
                        eventType: "appointment.created",
                        payload: {
                            appointmentId: createdAppt.id,
                            organizationId: createdAppt.organizationId,
                            status: createdAppt.status,
                            startAt: createdAppt.startAt,
                            endAt: createdAppt.endAt,
                        },
                    });
                }
            }

            // Step 6: Log Audited Override in AuditLog
            if (override) {
                await tx.auditLog.create({
                    data: {
                        organizationId,
                        actorType: override.actorType,
                        actorId: override.actorId,
                        action: "appointment.override",
                        resourceType: targetType === "HOLD" ? "BookingHold" : "Appointment",
                        resourceId: (createdHold?.id || createdAppt?.id)!,
                        payload: {
                            reason: override.reason,
                            bypassedRules: override.bypassedRules || ["ALL_AVAILABILITY_CHECKS"],
                            targetType,
                            startAt: startDate.toISOString(),
                            endAt: endDate.toISOString(),
                            serviceId,
                            locationId,
                            staffId,
                        },
                    },
                });
            }

            return {
                success: true,
                startAt: startDate,
                endAt: endDate,
                serviceInterval,
                occupiedInterval,
                serviceDurationMin: effectiveServiceDuration,
                totalDurationMin: durationInfo.totalDurationMin,
                quoteSnapshot,
                allocatedResourceIds,
                assignedStaffId: staffId || null,
                bookingHold: createdHold,
                appointment: createdAppt,
            };
        };

        if (existingTx) {
            return execute(existingTx);
        }
        return this.prisma.$transaction(execute, { timeout: 15000 });
    }
}
