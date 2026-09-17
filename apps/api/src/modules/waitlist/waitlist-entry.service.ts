import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { OutboxService } from "../outbox/outbox.service";
import { PolicyService } from "../policy/policy.service";
import { IdempotencyService } from "../common/idempotency.service";
import {
    JoinWaitlistInput,
    UpdateWaitlistEntryInput,
    WaitlistEntryDto,
    JoinWaitlistFacadeInput,
    JoinWaitlistFacadeResult,
    WaitlistEntryStatus,
    SmartRescheduleWaitlistInput,
} from "@bookpro/contracts";

@Injectable()
export class WaitlistEntryService {
    private readonly logger = new Logger(WaitlistEntryService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly outboxService: OutboxService,
        private readonly policyService: PolicyService,
        private readonly idempotencyService: IdempotencyService,
    ) { }

    /**
     * Customer or Guest joins the Waitlist for a service
     */
    async joinWaitlist(
        organizationId: string,
        input: JoinWaitlistInput,
        sessionUserId?: string,
    ): Promise<WaitlistEntryDto> {
        const res = await this.idempotencyService.executeIdempotent<WaitlistEntryDto>(
            {
                organizationId,
                operation: "WAITLIST_JOIN",
                idempotencyKey: input.idempotencyKey,
                payload: input,
            },
            async () => {
                // Step 1: Validate date range
                const startWindow = new Date(input.startWindowDate);
                const endWindow = new Date(input.endWindowDate);

                if (isNaN(startWindow.getTime()) || isNaN(endWindow.getTime())) {
                    throw new BadRequestException("Invalid startWindowDate or endWindowDate format.");
                }

                if (startWindow > endWindow) {
                    throw new BadRequestException("startWindowDate cannot be after endWindowDate.");
                }

                // Must not be in the past (compare with start of today UTC)
                const today = new Date();
                today.setUTCHours(0, 0, 0, 0);
                if (endWindow < today) {
                    throw new BadRequestException("endWindowDate cannot be in the past.");
                }

                // Step 2: Validate party size
                const partySize = input.partySize ?? 1;
                if (partySize < 1) {
                    throw new BadRequestException("partySize must be at least 1.");
                }

                // Step 3: Validate service
                const service = await this.prisma.service.findFirst({
                    where: {
                        id: input.serviceId,
                        organizationId,
                        isActive: true,
                    },
                });
                if (!service) {
                    throw new NotFoundException(`Service ${input.serviceId} not found in this organization.`);
                }

                // Step 4: Validate Location if provided
                if (input.locationId) {
                    const loc = await this.prisma.location.findFirst({
                        where: { id: input.locationId, organizationId },
                    });
                    if (!loc) {
                        throw new NotFoundException(`Location ${input.locationId} not found in this organization.`);
                    }
                }

                // Step 5: Validate Staff if provided
                if (input.staffId) {
                    const staff = await this.prisma.staffProfile.findFirst({
                        where: { id: input.staffId, organizationId, isActive: true },
                    });
                    if (!staff) {
                        throw new NotFoundException(`Staff profile ${input.staffId} not found in this organization.`);
                    }
                }

                // Step 6: Resolve or create customer
                let customerId = input.customerId;
                if (!customerId) {
                    if (sessionUserId) {
                        const userCustomer = await this.prisma.customer.findFirst({
                            where: { organizationId, userId: sessionUserId },
                        });
                        if (userCustomer) {
                            customerId = userCustomer.id;
                        }
                    }

                    if (!customerId) {
                        const email = (input.guestEmail || "").toLowerCase().trim();
                        const name = (input.guestName || "").trim();
                        if (!email || !name) {
                            throw new BadRequestException("Customer authentication or guest name and email is required.");
                        }

                        // Upsert customer
                        const customer = await this.prisma.customer.upsert({
                            where: {
                                organizationId_email: {
                                    organizationId,
                                    email,
                                },
                            },
                            update: {
                                fullName: name,
                                phone: input.guestPhone || undefined,
                            },
                            create: {
                                organizationId,
                                email,
                                fullName: name,
                                phone: input.guestPhone || null,
                            },
                        });
                        customerId = customer.id;
                    }
                }

                // Verify customer belongs to organization
                const customer = await this.prisma.customer.findFirst({
                    where: { id: customerId, organizationId },
                });
                if (!customer) {
                    throw new ForbiddenException("Customer does not belong to this organization.");
                }

                // Calculate entry expiration (end of endWindowDate day in UTC)
                const expiresAt = new Date(endWindow);
                expiresAt.setUTCHours(23, 59, 59, 999);

                // Step 7: Create WaitlistEntry in DB
                const entry = await this.prisma.waitlistEntry.create({
                    data: {
                        organizationId,
                        customerId,
                        serviceId: input.serviceId,
                        locationId: input.locationId || null,
                        staffId: input.staffId || null,
                        allowFallbackStaff: input.allowFallbackStaff ?? true,
                        startWindowDate: startWindow,
                        endWindowDate: endWindow,
                        timePreference: input.timePreference || "ANY",
                        customStartTimeMin: input.customStartTimeMin ?? null,
                        customEndTimeMin: input.customEndTimeMin ?? null,
                        partySize,
                        notes: input.notes || null,
                        notificationChannels: input.notificationChannels || ["EMAIL"],
                        status: "ACTIVE",
                        expiresAt,
                    },
                    include: {
                        service: true,
                        location: true,
                        staff: true,
                        customer: true,
                    },
                });

                // Step 8: Emit Outbox event for notification
                await this.outboxService.emit({
                    organizationId,
                    aggregateType: "WaitlistEntry",
                    aggregateId: entry.id,
                    eventType: "waitlist.joined",
                    payload: {
                        waitlistEntryId: entry.id,
                        organizationId,
                        customerId: entry.customerId,
                        serviceId: entry.serviceId,
                        customerName: entry.customer.fullName,
                        customerEmail: entry.customer.email,
                        serviceName: entry.service.name,
                        startWindowDate: entry.startWindowDate.toISOString().split("T")[0],
                        endWindowDate: entry.endWindowDate.toISOString().split("T")[0],
                        timePreference: entry.timePreference,
                    },
                });

                this.logger.log(`[Waitlist] Customer ${customer.email} joined waitlist for ${service.name} (Entry: ${entry.id})`);

                return this.mapToDto(entry);
            },
        );

        return res.data;
    }

    /**
     * Get Customer's own waitlist entries
     */
    async getCustomerEntries(
        organizationId: string,
        customerId: string,
    ): Promise<WaitlistEntryDto[]> {
        const entries = await this.prisma.waitlistEntry.findMany({
            where: {
                organizationId,
                customerId,
            },
            include: {
                service: true,
                location: true,
                staff: true,
                customer: true,
            },
            orderBy: { createdAt: "desc" },
        });

        return entries.map((e) => this.mapToDto(e));
    }

    /**
     * Update customer preferences on active waitlist entry
     */
    async updatePreferences(
        organizationId: string,
        entryId: string,
        customerId: string,
        input: UpdateWaitlistEntryInput,
    ): Promise<WaitlistEntryDto> {
        const entry = await this.prisma.waitlistEntry.findFirst({
            where: { id: entryId, organizationId },
        });

        if (!entry) {
            throw new NotFoundException(`Waitlist entry ${entryId} not found.`);
        }

        if (entry.customerId !== customerId) {
            throw new ForbiddenException("Cannot modify waitlist entry belonging to another customer.");
        }

        if (entry.status !== "ACTIVE" && entry.status !== "OFFERED") {
            throw new BadRequestException(`Cannot update waitlist entry with status ${entry.status}.`);
        }

        let startWindow = entry.startWindowDate;
        let endWindow = entry.endWindowDate;

        if (input.startWindowDate) {
            startWindow = new Date(input.startWindowDate);
        }
        if (input.endWindowDate) {
            endWindow = new Date(input.endWindowDate);
        }

        if (startWindow > endWindow) {
            throw new BadRequestException("startWindowDate cannot be after endWindowDate.");
        }

        const updated = await this.prisma.waitlistEntry.update({
            where: { id: entryId },
            data: {
                serviceId: input.serviceId ?? undefined,
                locationId: input.locationId !== undefined ? input.locationId : undefined,
                staffId: input.staffId !== undefined ? input.staffId : undefined,
                allowFallbackStaff: input.allowFallbackStaff !== undefined ? input.allowFallbackStaff : undefined,
                startWindowDate: startWindow,
                endWindowDate: endWindow,
                timePreference: input.timePreference ?? undefined,
                customStartTimeMin: input.customStartTimeMin !== undefined ? input.customStartTimeMin : undefined,
                customEndTimeMin: input.customEndTimeMin !== undefined ? input.customEndTimeMin : undefined,
                partySize: input.partySize ?? undefined,
                notes: input.notes !== undefined ? input.notes : undefined,
                notificationChannels: input.notificationChannels ?? undefined,
            },
            include: {
                service: true,
                location: true,
                staff: true,
                customer: true,
            },
        });

        return this.mapToDto(updated);
    }

    /**
     * Cancel an active waitlist entry
     */
    async cancelEntry(
        organizationId: string,
        entryId: string,
        customerId?: string,
    ): Promise<WaitlistEntryDto> {
        const entry = await this.prisma.waitlistEntry.findFirst({
            where: { id: entryId, organizationId },
        });

        if (!entry) {
            throw new NotFoundException(`Waitlist entry ${entryId} not found.`);
        }

        if (customerId && entry.customerId !== customerId) {
            throw new ForbiddenException("Cannot cancel waitlist entry belonging to another customer.");
        }

        if (entry.status === "CANCELLED" || entry.status === "BOOKED") {
            return this.mapToDto(
                await this.prisma.waitlistEntry.findUniqueOrThrow({
                    where: { id: entryId },
                    include: { service: true, location: true, staff: true, customer: true },
                }),
            );
        }

        const cancelled = await this.prisma.waitlistEntry.update({
            where: { id: entryId },
            data: { status: "CANCELLED" },
            include: { service: true, location: true, staff: true, customer: true },
        });

        // Emit outbox event
        await this.outboxService.emit({
            organizationId,
            aggregateType: "WaitlistEntry",
            aggregateId: cancelled.id,
            eventType: "waitlist.entry_cancelled",
            payload: {
                waitlistEntryId: cancelled.id,
                organizationId,
                customerId: cancelled.customerId,
            },
        });

        return this.mapToDto(cancelled);
    }

    /**
     * Staff query: List waitlist entries with filtering
     */
    async listEntriesForStaff(
        organizationId: string,
        query: {
            status?: WaitlistEntryStatus;
            serviceId?: string;
            locationId?: string;
            staffId?: string;
            search?: string;
            page?: number;
            limit?: number;
        },
    ): Promise<{ items: WaitlistEntryDto[]; total: number; page: number; limit: number }> {
        const page = Math.max(1, query.page || 1);
        const limit = Math.min(100, Math.max(1, query.limit || 20));
        const skip = (page - 1) * limit;

        const where: any = {
            organizationId,
            ...(query.status ? { status: query.status } : {}),
            ...(query.serviceId ? { serviceId: query.serviceId } : {}),
            ...(query.locationId ? { locationId: query.locationId } : {}),
            ...(query.staffId ? { staffId: query.staffId } : {}),
        };

        if (query.search) {
            where.customer = {
                OR: [
                    { fullName: { contains: query.search, mode: "insensitive" } },
                    { email: { contains: query.search, mode: "insensitive" } },
                    { phone: { contains: query.search, mode: "insensitive" } },
                ],
            };
        }

        const [items, total] = await Promise.all([
            this.prisma.waitlistEntry.findMany({
                where,
                include: {
                    service: true,
                    location: true,
                    staff: true,
                    customer: true,
                },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            this.prisma.waitlistEntry.count({ where }),
        ]);

        return {
            items: items.map((e) => this.mapToDto(e)),
            total,
            page,
            limit,
        };
    }

    /**
     * Clean Facade for AI Receptionist Tool (P10 Readiness)
     */
    async joinWaitlistFacade(input: JoinWaitlistFacadeInput): Promise<JoinWaitlistFacadeResult> {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.serviceNameOrId);

        // Resolve service
        let service = await this.prisma.service.findFirst({
            where: {
                organizationId: input.organizationId,
                isActive: true,
                OR: isUuid
                    ? [
                        { id: input.serviceNameOrId },
                        { name: { contains: input.serviceNameOrId, mode: "insensitive" } },
                    ]
                    : [
                        { name: { contains: input.serviceNameOrId, mode: "insensitive" } },
                    ],
            },
        });

        if (!service) {
            // Fallback: pick first active service
            service = await this.prisma.service.findFirst({
                where: { organizationId: input.organizationId, isActive: true },
            });
        }

        if (!service) {
            throw new NotFoundException(`No matching service found in organization.`);
        }

        // Resolve staff if provided
        let staffId: string | null = null;
        if (input.preferredStaffNameOrId) {
            const isStaffUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.preferredStaffNameOrId);
            const staff = await this.prisma.staffProfile.findFirst({
                where: {
                    organizationId: input.organizationId,
                    isActive: true,
                    OR: isStaffUuid
                        ? [
                            { id: input.preferredStaffNameOrId },
                            { displayName: { contains: input.preferredStaffNameOrId, mode: "insensitive" } },
                        ]
                        : [
                            { displayName: { contains: input.preferredStaffNameOrId, mode: "insensitive" } },
                        ],
                },
            });
            if (staff) {
                staffId = staff.id;
            }
        }

        const entry = await this.joinWaitlist(input.organizationId, {
            serviceId: service.id,
            staffId,
            startWindowDate: input.preferredDateRange.start,
            endWindowDate: input.preferredDateRange.end,
            timePreference: input.timeOfDay || "ANY",
            guestName: input.customerName,
            guestEmail: input.customerEmail,
            guestPhone: input.customerPhone,
            notes: input.notes,
        });

        return {
            success: true,
            waitlistEntryId: entry.id,
            serviceName: service.name,
            dateWindow: `${input.preferredDateRange.start} to ${input.preferredDateRange.end}`,
            status: entry.status,
            summary: `Successfully added ${input.customerName} to the waitlist for ${service.name} between ${input.preferredDateRange.start} and ${input.preferredDateRange.end}.`,
        };
    }

    /**
     * Customer requests smart rescheduling via the Priority Waitlist when target dates/times are fully booked.
     * Their existing confirmed appointment remains untouched and secure until an opening is claimed.
     */
    async createSmartRescheduleWaitlist(
        organizationId: string,
        customerId: string,
        input: SmartRescheduleWaitlistInput,
    ): Promise<WaitlistEntryDto> {
        // Step 1: Verify the appointment belongs to the customer and organization
        const appointment = await this.prisma.appointment.findFirst({
            where: {
                id: input.appointmentId,
                organizationId,
                customerId,
            },
            include: {
                service: true,
                location: true,
                staff: true,
                customer: true,
            },
        });

        if (!appointment) {
            throw new NotFoundException(`Appointment ${input.appointmentId} not found or does not belong to you.`);
        }

        if (appointment.status !== "CONFIRMED" && appointment.status !== "CHECKED_IN") {
            throw new BadRequestException(`Cannot request reschedule waitlist for appointment with status ${appointment.status}.`);
        }

        // Step 2: Validate date windows
        const startWindow = new Date(input.preferredDateRange.start);
        const endWindow = new Date(input.preferredDateRange.end);
        if (isNaN(startWindow.getTime()) || isNaN(endWindow.getTime())) {
            throw new BadRequestException("Invalid preferredDateRange format.");
        }
        if (startWindow > endWindow) {
            throw new BadRequestException("startWindow cannot be after endWindow.");
        }

        const expiresAt = new Date(endWindow);
        expiresAt.setUTCHours(23, 59, 59, 999);

        // Step 3: Create Priority Waitlist Entry linked to appointment
        const notes = input.notes
            ? `${input.notes} [Priority Reschedule for Appt #${appointment.id} (${appointment.startAt.toISOString()})]`
            : `Priority Reschedule for Appt #${appointment.id} (${appointment.startAt.toISOString()})`;

        const entry = await this.prisma.waitlistEntry.create({
            data: {
                organizationId,
                customerId,
                serviceId: appointment.serviceId,
                locationId: appointment.locationId,
                staffId: input.staffId !== undefined ? input.staffId : appointment.staffId,
                allowFallbackStaff: true,
                startWindowDate: startWindow,
                endWindowDate: endWindow,
                timePreference: input.timePreference || "ANY",
                partySize: appointment.partySize || 1,
                notes,
                notificationChannels: ["EMAIL"],
                status: "ACTIVE",
                expiresAt,
            },
            include: {
                service: true,
                location: true,
                staff: true,
                customer: true,
            },
        });

        // Step 4: Emit outbox event
        await this.outboxService.emit({
            organizationId,
            aggregateType: "WaitlistEntry",
            aggregateId: entry.id,
            eventType: "waitlist.smart_reschedule_requested",
            payload: {
                waitlistEntryId: entry.id,
                organizationId,
                customerId,
                appointmentId: appointment.id,
                serviceId: appointment.serviceId,
                serviceName: appointment.service.name,
                preferredStart: input.preferredDateRange.start,
                preferredEnd: input.preferredDateRange.end,
                timePreference: input.timePreference || "ANY",
            },
        });

        this.logger.log(
            `[Waitlist] Smart reschedule waitlist entry created for customer ${customerId}, linked to appointment ${appointment.id}`
        );

        return this.mapToDto(entry);
    }

    private mapToDto(entry: any): WaitlistEntryDto {
        return {
            id: entry.id,
            organizationId: entry.organizationId,
            customerId: entry.customerId,
            customerName: entry.customer?.fullName,
            customerEmail: entry.customer?.email,
            customerPhone: entry.customer?.phone,
            serviceId: entry.serviceId,
            serviceName: entry.service?.name,
            serviceDurationMin: entry.service?.durationMin,
            servicePriceCents: entry.service?.priceCents,
            locationId: entry.locationId,
            locationName: entry.location?.name,
            staffId: entry.staffId,
            staffName: entry.staff?.displayName,
            allowFallbackStaff: entry.allowFallbackStaff,
            startWindowDate: entry.startWindowDate instanceof Date ? entry.startWindowDate.toISOString().split("T")[0] : String(entry.startWindowDate),
            endWindowDate: entry.endWindowDate instanceof Date ? entry.endWindowDate.toISOString().split("T")[0] : String(entry.endWindowDate),
            timePreference: entry.timePreference,
            customStartTimeMin: entry.customStartTimeMin,
            customEndTimeMin: entry.customEndTimeMin,
            partySize: entry.partySize,
            notes: entry.notes,
            notificationChannels: entry.notificationChannels || ["EMAIL"],
            status: entry.status,
            expiresAt: entry.expiresAt ? entry.expiresAt.toISOString() : null,
            createdAt: entry.createdAt.toISOString(),
            updatedAt: entry.updatedAt.toISOString(),
        };
    }
}
