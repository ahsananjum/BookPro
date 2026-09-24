import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { ActorType, AIActionCard, PermissionKey, RequestContext } from "@bookpro/contracts";
import { aiToolSchemas, AIToolName } from "@bookpro/validation";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { PrismaService } from "../database/prisma.service";
import { ServiceService } from "../service/service.service";
import { AvailabilityService } from "../availability/availability.service";
import { AppointmentService } from "../appointments/appointment.service";
import { BookingHoldService } from "../holds/booking-hold.service";
import { PricingService } from "../pricing/pricing.service";
import { PolicyService } from "../policy/policy.service";
import { WaitlistEntryService } from "../waitlist/waitlist-entry.service";
import { PaymentsService } from "../payments/payments.service";
import { LocationService } from "../location/location.service";
import { StaffService } from "../staff/staff.service";
import { OrganizationService } from "../organization/organization.service";
import { DashboardOverviewService } from "../organization/dashboard-overview.service";
import { CrmService } from "../crm/crm.service";
import { WaitlistOfferService } from "../waitlist/waitlist-offer.service";
import { GapDetectionService } from "../optimizer/gap-detection.service";
import { ScheduleInsightService } from "../optimizer/schedule-insight.service";
import { RecoveredRevenueService } from "../optimizer/recovered-revenue.service";
import { MarketingService } from "../marketing/marketing.service";
import { CommissionsService } from "../commissions/commissions.service";

export interface TrustedAIContext {
    organizationId: string;
    participantId: string;
    customerId?: string;
    actorType: ActorType;
    subjectId: string;
    permissions: PermissionKey[];
    locationIds?: string[];
    correlationId: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface AIToolResult {
    result: Record<string, unknown>;
    card: AIActionCard;
    sideEffect: boolean;
}

@Injectable()
export class AIToolRegistryService {
    private readonly proposalSecret = process.env.AI_PROPOSAL_SECRET || process.env.JWT_SECRET || "";

    constructor(
        private readonly prisma: PrismaService,
        private readonly services: ServiceService,
        private readonly availability: AvailabilityService,
        private readonly appointments: AppointmentService,
        private readonly holds: BookingHoldService,
        private readonly pricing: PricingService,
        private readonly policies: PolicyService,
        private readonly waitlist: WaitlistEntryService,
        private readonly payments: PaymentsService,
        private readonly locations: LocationService,
        private readonly staff: StaffService,
        @Optional() private readonly organizations?: OrganizationService,
        @Optional() private readonly dashboardOverview?: DashboardOverviewService,
        @Optional() private readonly crm?: CrmService,
        @Optional() private readonly waitlistOffers?: WaitlistOfferService,
        @Optional() private readonly gapDetection?: GapDetectionService,
        @Optional() private readonly scheduleInsights?: ScheduleInsightService,
        @Optional() private readonly recoveredRevenue?: RecoveredRevenueService,
        @Optional() private readonly marketing?: MarketingService,
        @Optional() private readonly commissions?: CommissionsService,
    ) {}

    buildTrustedContext(ctx: RequestContext): TrustedAIContext {
        if (!ctx.organizationId) {
            throw new ForbiddenException({ code: "TENANT_CONTEXT_REQUIRED", message: "A verified tenant context is required." });
        }
        const participantId = ctx.customerId || ctx.subjectId;
        if (!participantId || participantId === "anonymous") {
            throw new ForbiddenException({ code: "PARTICIPANT_CONTEXT_REQUIRED", message: "A verified participant is required." });
        }
        return {
            organizationId: ctx.organizationId,
            participantId,
            customerId: ctx.customerId,
            actorType: ctx.actorType,
            subjectId: ctx.subjectId,
            permissions: [...ctx.permissions],
            locationIds: ctx.locationIds ? [...ctx.locationIds] : undefined,
            correlationId: ctx.correlationId,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
        };
    }

    async execute(
        conversationId: string,
        name: string,
        rawArgs: unknown,
        ctx: TrustedAIContext,
        idempotencyKey: string,
    ): Promise<AIToolResult> {
        if (!(name in aiToolSchemas)) {
            throw new BadRequestException({ code: "AI_TOOL_NOT_REGISTERED", message: "The requested AI tool is not registered." });
        }
        const toolName = name as AIToolName;
        const parsed = aiToolSchemas[toolName].safeParse(rawArgs);
        if (!parsed.success) {
            throw new BadRequestException({ code: "AI_TOOL_SCHEMA_INVALID", message: "The AI tool arguments were rejected.", details: parsed.error.flatten() });
        }

        this.assertRoleToolAccess(toolName, ctx);

        const existing = await this.prisma.aIToolExecution.findFirst({
            where: { conversationId, idempotencyKey },
        });
        if (existing?.sanitizedResult && ["SUCCEEDED", "PROPOSED"].includes(existing.status)) {
            const previous = existing.sanitizedResult as Record<string, any>;
            return { result: previous.result, card: previous.card, sideEffect: existing.sideEffect };
        }

        const sideEffect = [
            "createBookingHold",
            "releaseBookingHold",
            "confirmBooking",
            "rescheduleBooking",
            "autoRescheduleAppointment",
            "cancelBooking",
            "joinWaitlist",
            "leaveWaitlist",
            "scheduleStaffAppointment",
            "rescheduleStaffAppointment",
            "cancelStaffAppointment",
            "updateAppointmentStatus",
            "createBusinessService",
            "updateBusinessService",
            "updateStaffStatus",
            "addCustomerInternalNote",
            "tagCustomer",
            "issueManualWaitlistOffer",
            "createDiscountCoupon",
            "updateBusinessPolicy",
        ].includes(toolName);
        const execution = existing
            ? await this.prisma.aIToolExecution.update({
                where: { id: existing.id },
                data: { status: "STARTED", errorCode: null, completedAt: null, sanitizedArgs: this.sanitize(parsed.data), correlationId: ctx.correlationId },
            })
            : await this.prisma.aIToolExecution.create({
                data: {
                    organizationId: ctx.organizationId,
                    conversationId,
                    toolName,
                    status: "STARTED",
                    sideEffect,
                    sanitizedArgs: this.sanitize(parsed.data),
                    idempotencyKey,
                    correlationId: ctx.correlationId,
                },
            });

        try {
            const output = await this.dispatch(conversationId, toolName, parsed.data as any, ctx);
            await this.prisma.aIToolExecution.update({
                where: { id: execution.id },
                data: {
                    status: output.card.kind === "CONFIRMATION" ? "PROPOSED" : "SUCCEEDED",
                    sanitizedResult: this.sanitize({ result: output.result, card: output.card }),
                    completedAt: new Date(),
                },
            });
            return output;
        } catch (error: any) {
            await this.prisma.aIToolExecution.update({
                where: { id: execution.id },
                data: { status: "FAILED", errorCode: this.errorCode(error), completedAt: new Date() },
            });
            throw error;
        }
    }

    async confirmProposal(
        conversationId: string,
        proposalId: string,
        confirmationToken: string,
        idempotencyKey: string,
        ctx: TrustedAIContext,
    ): Promise<AIToolResult> {
        const proposal = await this.prisma.aIActionProposal.findFirst({
            where: { id: proposalId, conversationId, organizationId: ctx.organizationId, participantId: ctx.participantId },
        });
        if (!proposal) throw new NotFoundException({ code: "AI_PROPOSAL_NOT_FOUND", message: "The action proposal was not found." });
        if (!this.verifyConfirmationToken(confirmationToken, proposal.confirmationHash)) {
            throw new ForbiddenException({ code: "AI_CONFIRMATION_INVALID", message: "The confirmation does not match this proposal." });
        }
        if (proposal.status === "EXECUTED" && proposal.result) {
            const previous = proposal.result as Record<string, any>;
            return { result: previous.result, card: previous.card, sideEffect: true };
        }
        if (proposal.status !== "PENDING" || proposal.expiresAt <= new Date()) {
            if (proposal.status === "PENDING") {
                await this.prisma.aIActionProposal.update({ where: { id: proposal.id }, data: { status: "EXPIRED" } });
            }
            throw new ConflictException({ code: "AI_PROPOSAL_STALE", message: "This proposal is stale. Please request a fresh authoritative proposal." });
        }

        const claimed = await this.prisma.aIActionProposal.updateMany({
            where: { id: proposal.id, status: "PENDING", expiresAt: { gt: new Date() } },
            data: { status: "CONFIRMED", confirmedAt: new Date() },
        });
        if (claimed.count !== 1) {
            throw new ConflictException({ code: "AI_PROPOSAL_ALREADY_CONFIRMED", message: "This proposal is already being processed. Refetch canonical state." });
        }

        try {
            await this.revalidateProposal(proposal.actionType, proposal.authoritativeData as Record<string, any>, proposal.executionArgs as Record<string, any>, ctx);
            const output = await this.executeConfirmedAction(proposal.actionType, proposal.executionArgs as Record<string, any>, ctx, `proposal:${proposal.id}`);
            await this.prisma.$transaction([
                this.prisma.aIActionProposal.update({
                    where: { id: proposal.id },
                    data: { status: "EXECUTED", executedAt: new Date(), result: this.sanitize({ result: output.result, card: output.card }) },
                }),
                this.prisma.auditLog.create({
                    data: {
                        organizationId: ctx.organizationId,
                        actorType: "AI_TOOL",
                        actorId: ctx.subjectId,
                        action: `ai.${proposal.actionType}`,
                        resourceType: "AIActionProposal",
                        resourceId: proposal.id,
                        payload: this.sanitize({ conversationId, delegatedParticipantId: ctx.participantId, result: output.result, correlationId: ctx.correlationId }),
                        ipAddress: ctx.ipAddress,
                        userAgent: ctx.userAgent,
                    },
                }),
            ]);
            return output;
        } catch (error) {
            await this.prisma.aIActionProposal.updateMany({ where: { id: proposal.id, status: "CONFIRMED" }, data: { status: "PENDING" } });
            throw error;
        }
    }

    private async dispatch(conversationId: string, name: AIToolName, args: any, ctx: TrustedAIContext): Promise<AIToolResult> {
        switch (name) {
            case "getLocations": {
                this.requirePermissionOrCustomer(ctx, PermissionKey.LOCATION_READ);
                const query = args.query?.toLowerCase();
                const locations = (await this.locations.getLocations(ctx.organizationId))
                    .filter((loc: any) => !query || loc.name.toLowerCase().includes(query) || loc.slug.toLowerCase().includes(query))
                    .map((loc: any) => ({
                        id: loc.id,
                        name: loc.name,
                        slug: loc.slug,
                        address: [loc.address, loc.city, loc.state, loc.postalCode].filter(Boolean).join(", ") || loc.address || null,
                        phone: loc.phone || null,
                        email: loc.email || null,
                        timezone: loc.timezone,
                        operatingHours: loc.operatingHours || null,
                    }));
                return this.infoCard(name, "Authoritative locations", { locations });
            }
            case "getServices": {
                this.requirePermissionOrCustomer(ctx, PermissionKey.SERVICE_READ);
                if (args.locationId) this.assertLocationScope(ctx, args.locationId);
                const query = args.query?.toLowerCase();
                const rows = (await this.services.getServices(ctx.organizationId))
                    .filter((service: any) => service.isActive && (!query || service.name.toLowerCase().includes(query)))
                    .slice(0, 30)
                    .map((service: any) => ({
                        id: service.id,
                        name: service.name,
                        category: service.category || "General",
                        durationMin: service.durationMin,
                        priceCents: service.priceCents,
                        currency: service.currency,
                        depositType: service.depositType,
                        depositValue: service.depositValue,
                        preparationSummary: service.preparationInstructions || null,
                    }));
                return this.customCard("SERVICE_CATALOG", name, "Authoritative services", { services: rows });
            }
            case "getServiceDetails": {
                this.requirePermissionOrCustomer(ctx, PermissionKey.SERVICE_READ);
                const service = await this.services.getServiceById(ctx.organizationId, args.serviceId);
                const details = {
                    id: service.id,
                    name: service.name,
                    category: service.category || "General",
                    description: service.description || "No description provided.",
                    durationMin: service.durationMin,
                    preBufferMin: service.preBufferMin || 0,
                    postBufferMin: service.postBufferMin || 0,
                    priceCents: service.priceCents,
                    currency: service.currency,
                    depositType: service.depositType || "NONE",
                    depositValue: service.depositValue || 0,
                    capacity: service.capacity || 1,
                    minParticipants: service.minParticipants || 1,
                    maxParticipants: service.maxParticipants || 1,
                    preparationInstructions: service.preparationInstructions || null,
                };
                return this.infoCard(name, `Service Details: ${service.name}`, details);
            }
            case "findAvailability": {
                this.requirePermissionOrCustomer(ctx, PermissionKey.APPOINTMENT_READ);
                let locationId = args.locationId;
                if (!locationId && typeof this.locations.getLocations === "function") {
                    const locations = await this.locations.getLocations(ctx.organizationId).catch(() => []);
                    locationId = locations[0]?.id;
                }
                if (!locationId) {
                    locationId = "00000000-0000-0000-0000-000000000000";
                }
                this.assertLocationScope(ctx, locationId);

                const location = await this.locations.getLocationById(ctx.organizationId, locationId).catch(() => null);
                const timezone = args.timezone || location?.timezone || "UTC";

                let serviceId = (args.serviceId || "").trim();
                let service: any = null;

                if (serviceId) {
                    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceId);
                    if (isUuid) {
                        service = await this.services.getServiceById(ctx.organizationId, serviceId).catch(() => null);
                    }
                }

                if (!service) {
                    const allServices = (await this.services.getServices(ctx.organizationId).catch(() => []))
                        .filter((s: any) => s.isActive);
                    if (serviceId) {
                        service = allServices.find((s: any) => s.name.toLowerCase().includes(serviceId.toLowerCase()));
                    }
                    if (!service) {
                        const customer = await this.resolveCustomer(ctx);
                        if (customer) {
                            const lastAppt = await this.prisma.appointment.findFirst({
                                where: { organizationId: ctx.organizationId, customerId: customer.id },
                                orderBy: { createdAt: "desc" },
                                include: { service: true },
                            });
                            if (lastAppt?.service && lastAppt.service.isActive) {
                                service = lastAppt.service;
                            }
                        }
                    }
                    if (!service && allServices.length === 1) {
                        service = allServices[0];
                    }
                    if (!service) {
                        if (serviceId) {
                            throw new NotFoundException({ code: "SERVICE_NOT_FOUND", message: `Service '${args.serviceId || ""}' not found.` });
                        }
                        if (allServices.length === 0) {
                            throw new NotFoundException({ code: "NO_ACTIVE_SERVICES", message: "No active services available." });
                        }
                        const catalogCards = allServices.slice(0, 20).map((s: any) => ({
                            id: s.id,
                            name: s.name,
                            category: s.category || "General",
                            durationMin: s.durationMin,
                            priceCents: s.priceCents,
                            currency: s.currency,
                            depositType: s.depositType,
                            depositValue: s.depositValue,
                        }));
                        return this.customCard("SERVICE_CATALOG", name, "Please select a service for availability", {
                            services: catalogCards,
                            prompt: "Please choose which service you would like to book to see available dates and times.",
                        });
                    }
                }
                serviceId = service.id;

                // Function to get current date string in specific location timezone
                const getTzDate = (offsetDays: number = 0): string => {
                    const now = new Date();
                    now.setDate(now.getDate() + offsetDays);
                    try {
                        const formatter = new Intl.DateTimeFormat("en-CA", {
                            timeZone: timezone,
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                        });
                        const parts = formatter.formatToParts(now);
                        const y = parts.find((p) => p.type === "year")?.value;
                        const m = parts.find((p) => p.type === "month")?.value;
                        const d = parts.find((p) => p.type === "day")?.value;
                        return `${y}-${m}-${d}`;
                    } catch {
                        return now.toISOString().slice(0, 10);
                    }
                };

                let startDateStr = (args.startDate || "").toLowerCase().trim();
                let startDate = "";
                if (startDateStr === "tomorrow") {
                    startDate = getTzDate(1);
                } else if (startDateStr === "today") {
                    startDate = getTzDate(0);
                } else if (/^\d{4}-\d{2}-\d{2}$/.test(startDateStr.slice(0, 10))) {
                    startDate = startDateStr.slice(0, 10);
                } else {
                    startDate = getTzDate(0);
                }

                let endDateStr = (args.endDate || "").toLowerCase().trim();
                let endDate = "";
                if (endDateStr === "tomorrow") {
                    endDate = getTzDate(1);
                } else if (endDateStr === "today") {
                    endDate = getTzDate(0);
                } else if (/^\d{4}-\d{2}-\d{2}$/.test(endDateStr.slice(0, 10))) {
                    endDate = endDateStr.slice(0, 10);
                } else {
                    const [y, m, d] = startDate.split("-").map(Number);
                    const startDt = new Date(Date.UTC(y, m - 1, d));
                    startDt.setUTCDate(startDt.getUTCDate() + 2);
                    endDate = startDt.toISOString().slice(0, 10);
                }
                if (endDate < startDate) {
                    endDate = startDate;
                }

                const [available, policy] = await Promise.all([
                    this.availability.searchAvailability({
                        organizationId: ctx.organizationId,
                        locationId,
                        serviceId,
                        staffId: args.staffId,
                        startDate,
                        endDate,
                        presentationTimezone: timezone,
                        partySize: args.partySize || 1,
                    }),
                    this.policies.resolvePolicy(ctx.organizationId, locationId, serviceId).catch(() => null),
                ]);

                const result = {
                    ...available,
                    serviceId: service.id,
                    serviceName: service.name,
                    durationMin: service.durationMin,
                    priceCents: service.priceCents,
                    currency: service.currency,
                    depositType: service.depositType || "NONE",
                    depositValue: service.depositValue || 0,
                    holdDurationMinutes: policy?.holdDurationMinutes ?? 10,
                    cancelCutoffHours: policy?.cancelCutoffHours ?? 24,
                    locationId: location?.id || locationId,
                    locationName: location?.name || "Primary Location",
                    timezone,
                    slots: (available?.slots || []).slice(0, 40),
                };
                return this.customCard(
                    "AVAILABILITY_SLOTS",
                    name,
                    result.slots.length ? "Available Booking Slots" : "No Available Slots Found",
                    result as any
                );
            }
            case "getBooking": {
                const booking = await this.getAuthorizedBooking(args.bookingId, ctx, PermissionKey.APPOINTMENT_READ);
                return this.customCard("APPOINTMENT_LIST", name, "Confirmed backend booking", {
                    appointments: [this.bookingProjection(booking)],
                });
            }
            case "getOrganizationInfo": {
                let org: any = null;
                if (this.organizations) {
                    org = await this.organizations.getOrganization(ctx.organizationId).catch(() => null);
                }
                if (!org) {
                    org = await this.prisma.organization.findUnique({
                        where: { id: ctx.organizationId },
                        include: {
                            locations: {
                                where: { archivedAt: null },
                                select: { id: true, name: true, slug: true, address: true, city: true, state: true, postalCode: true, country: true, phone: true, email: true, timezone: true, operatingHours: true },
                            },
                        },
                    });
                }
                if (!org) throw new NotFoundException({ code: "ORGANIZATION_NOT_FOUND", message: "Organization not found." });
                const locations = org.locations || (await this.locations.getLocations(ctx.organizationId));
                const profile = {
                    name: org.name,
                    brandName: org.brandName || org.name,
                    slug: org.slug,
                    industry: org.industry || null,
                    timezone: org.timezone,
                    currency: org.currency,
                    phone: org.phone || null,
                    email: org.email || null,
                    website: org.website || null,
                    locations: locations.map((loc: any) => ({
                        id: loc.id,
                        name: loc.name,
                        address: [loc.address, loc.city, loc.state, loc.postalCode].filter(Boolean).join(", ") || loc.address || null,
                        phone: loc.phone || null,
                        email: loc.email || null,
                        timezone: loc.timezone,
                        operatingHours: loc.operatingHours || null,
                    })),
                };
                return this.infoCard(name, `${profile.brandName} Organization Information`, profile);
            }
            case "getMyAccountSummary": {
                const customer = await this.resolveCustomer(ctx);
                if (!customer) {
                    return this.customCard("ACCOUNT_SUMMARY", name, "Customer Account Overview", {
                        authenticated: false,
                        message: "No customer profile linked to this account in this organization.",
                        upcomingAppointmentsCount: 0,
                        activeHoldsCount: 0,
                        activeWaitlistCount: 0,
                    });
                }
                const now = new Date();
                const [upcomingCount, holdsCount, waitlistCount] = await Promise.all([
                    this.prisma.appointment.count({
                        where: {
                            organizationId: ctx.organizationId,
                            customerId: customer.id,
                            startAt: { gte: now },
                            status: { not: "CANCELLED" },
                        },
                    }),
                    this.prisma.bookingHold.count({
                        where: {
                            organizationId: ctx.organizationId,
                            customerId: customer.id,
                            status: "ACTIVE",
                            expiresAt: { gt: now },
                        },
                    }),
                    this.prisma.waitlistEntry.count({
                        where: {
                            organizationId: ctx.organizationId,
                            customerId: customer.id,
                            status: "ACTIVE",
                        },
                    }),
                ]);
                const summary = {
                    fullName: customer.fullName,
                    email: customer.email,
                    phone: customer.phone || null,
                    upcomingAppointmentsCount: upcomingCount,
                    activeHoldsCount: holdsCount,
                    activeWaitlistCount: waitlistCount,
                    memberSince: customer.createdAt.toISOString(),
                };
                return this.customCard("ACCOUNT_SUMMARY", name, `Account Overview for ${customer.fullName}`, summary);
            }
            case "getMyUpcomingAppointments": {
                const customer = await this.resolveCustomer(ctx);
                if (!customer) {
                    return this.customCard("APPOINTMENT_LIST", name, "Your Appointments", {
                        appointments: [],
                        message: "No appointments found. You do not have an active customer profile with this business yet.",
                    });
                }
                const now = new Date();
                const where: any = {
                    organizationId: ctx.organizationId,
                    customerId: customer.id,
                };
                let orderBy: any = { startAt: "asc" };
                if (args.status === "UPCOMING") {
                    where.startAt = { gte: now };
                    where.status = { not: "CANCELLED" };
                    orderBy = { startAt: "asc" };
                } else if (args.status === "PAST") {
                    where.startAt = { lt: now };
                    orderBy = { startAt: "desc" };
                } else {
                    orderBy = { startAt: "desc" };
                }
                const rows = await this.prisma.appointment.findMany({
                    where,
                    take: args.limit || 5,
                    orderBy,
                    include: {
                        service: { select: { id: true, name: true, durationMin: true } },
                        staff: { select: { id: true, displayName: true } },
                        location: { select: { id: true, name: true, address: true, city: true, timezone: true } },
                    },
                });
                const appointments = rows.map((appt) => ({
                    id: appt.id,
                    status: appt.status,
                    paymentStatus: appt.paymentStatus,
                    serviceName: appt.service.name,
                    durationMin: appt.service.durationMin,
                    staffDisplayName: appt.staff?.displayName || null,
                    locationName: appt.location.name,
                    locationAddress: [appt.location.address, appt.location.city].filter(Boolean).join(", ") || null,
                    startAt: appt.startAt.toISOString(),
                    endAt: appt.endAt.toISOString(),
                    priceCents: appt.priceCents,
                    currency: appt.currency,
                }));
                return this.customCard(
                    "APPOINTMENT_LIST",
                    name,
                    appointments.length > 0 ? `Authoritative Appointments (${appointments.length})` : "No Appointments Found",
                    { appointments, statusFilter: args.status || "UPCOMING" }
                );
            }
            case "getMyBookingHolds": {
                const customer = await this.resolveCustomer(ctx);
                if (!customer) {
                    return this.infoCard(name, "Active Booking Holds", { holds: [] });
                }
                const now = new Date();
                const holds = await this.prisma.bookingHold.findMany({
                    where: {
                        organizationId: ctx.organizationId,
                        customerId: customer.id,
                        status: "ACTIVE",
                        expiresAt: { gt: now },
                    },
                    include: {
                        service: { select: { name: true } },
                        location: { select: { name: true } },
                        staff: { select: { displayName: true } },
                    },
                    orderBy: { expiresAt: "asc" },
                });
                const formatted = holds.map((h) => {
                    const quote = (h.quoteSnapshot || {}) as Record<string, any>;
                    return {
                        holdId: h.id,
                        serviceName: h.service.name,
                        locationName: h.location.name,
                        staffDisplayName: h.staff?.displayName || null,
                        startAt: h.startAt.toISOString(),
                        endAt: h.endAt.toISOString(),
                        expiresAt: h.expiresAt.toISOString(),
                        payableNowCents: Number(quote.payableNowCents || 0),
                        currency: String(quote.currency || "USD"),
                    };
                });
                return this.infoCard(
                    name,
                    formatted.length ? `Active Booking Holds (${formatted.length})` : "No Active Booking Holds",
                    { holds: formatted }
                );
            }
            case "getMyWaitlistStatus": {
                const customer = await this.resolveCustomer(ctx);
                if (!customer) {
                    return this.customCard("WAITLIST_STATUS", name, "Waitlist Status", { waitlistEntries: [] });
                }
                const entries = await this.prisma.waitlistEntry.findMany({
                    where: {
                        organizationId: ctx.organizationId,
                        customerId: customer.id,
                    },
                    include: {
                        service: { select: { name: true } },
                        location: { select: { name: true } },
                        staff: { select: { displayName: true } },
                        offers: {
                            where: { expiresAt: { gt: new Date() } },
                            orderBy: { createdAt: "desc" },
                            take: 1,
                        },
                    },
                    orderBy: { createdAt: "desc" },
                });
                const formatted = entries.map((e) => {
                    const activeOffer = e.offers[0] ? {
                        offerId: e.offers[0].id,
                        startAt: e.offers[0].startAt.toISOString(),
                        endAt: e.offers[0].endAt.toISOString(),
                        expiresAt: e.offers[0].expiresAt.toISOString(),
                    } : null;
                    return {
                        id: e.id,
                        serviceName: e.service.name,
                        locationName: e.location?.name || null,
                        staffDisplayName: e.staff?.displayName || null,
                        startWindowDate: e.startWindowDate.toISOString().slice(0, 10),
                        endWindowDate: e.endWindowDate.toISOString().slice(0, 10),
                        timePreference: e.timePreference,
                        status: e.status,
                        expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
                        activeOffer,
                    };
                });
                return this.customCard(
                    "WAITLIST_STATUS",
                    name,
                    formatted.length ? `Waitlist Requests (${formatted.length})` : "No Active Waitlist Requests",
                    { waitlistEntries: formatted }
                );
            }
            case "getOrganizationPolicies": {
                const [policy, org] = await Promise.all([
                    this.policies.resolvePolicy(ctx.organizationId, args.locationId, args.serviceId),
                    this.prisma.organization?.findUnique
                        ? this.prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { currency: true } })
                        : null,
                ]);
                const currency = org?.currency || "USD";
                const summary = {
                    minNoticeHours: policy.minNoticeHours,
                    maxNoticeDays: policy.maxNoticeDays,
                    cancelCutoffHours: policy.cancelCutoffHours,
                    cancelFeeType: policy.cancelFeeType,
                    cancelFeeValue: policy.cancelFeeValue,
                    rescheduleCutoffHours: policy.rescheduleCutoffHours,
                    holdDurationMinutes: policy.holdDurationMinutes,
                    waitlistOfferExpiryMinutes: policy.waitlistOfferExpiryMinutes,
                    currency,
                    summaryText: `Cancellations require at least ${policy.cancelCutoffHours} hours advance notice. Reschedules require ${policy.rescheduleCutoffHours} hours notice. Booking holds are reserved for ${policy.holdDurationMinutes} minutes pending confirmation.`,
                };
                return this.customCard("POLICY_SUMMARY", name, "Authoritative Organization Policies", summary);
            }
            case "createBookingHold": {
                this.requirePermissionOrCustomer(ctx, PermissionKey.APPOINTMENT_CREATE);
                let locationId = args.locationId;
                if (!locationId) {
                    const locations = await this.locations.getLocations(ctx.organizationId);
                    locationId = locations[0]?.id;
                }
                if (!locationId) {
                    throw new NotFoundException({ code: "LOCATION_NOT_FOUND", message: "No active location found." });
                }
                this.assertLocationScope(ctx, locationId);

                let serviceId = args.serviceId;
                if (!serviceId) {
                    const allServices = await this.services.getServices(ctx.organizationId).catch(() => []);
                    serviceId = allServices[0]?.id;
                } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceId)) {
                    const allServices = await this.services.getServices(ctx.organizationId).catch(() => []);
                    const matched = allServices.find((s: any) => s.name.toLowerCase().includes(serviceId.toLowerCase()));
                    if (matched) serviceId = matched.id;
                    else if (allServices[0]) serviceId = allServices[0].id;
                }

                let staffId = args.staffId;
                if (staffId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staffId)) {
                    const allStaff = await this.staff.getStaffMembers(ctx.organizationId).catch(() => []);
                    const matchedStaff = allStaff.find((st: any) =>
                        st.displayName?.toLowerCase().includes(staffId.toLowerCase()) ||
                        st.user?.fullName?.toLowerCase().includes(staffId.toLowerCase())
                    );
                    staffId = matchedStaff ? matchedStaff.id : undefined;
                }

                const [service, location, policy] = await Promise.all([
                    this.services.getServiceById(ctx.organizationId, serviceId),
                    this.locations.getLocationById(ctx.organizationId, locationId),
                    this.policies.resolvePolicy(ctx.organizationId, locationId, serviceId),
                ]);

                let startAt = args.startAt;
                let endAt = args.endAt;
                if (!endAt && service?.durationMin && startAt) {
                    const sDate = new Date(startAt);
                    if (!isNaN(sDate.getTime())) {
                        endAt = new Date(sDate.getTime() + service.durationMin * 60_000).toISOString();
                    }
                }

                const [quote, slot] = await Promise.all([
                    this.pricing.calculateQuote(ctx.organizationId, { serviceId, staffId, locationId }),
                    this.availability.validateAvailability({
                        organizationId: ctx.organizationId,
                        locationId,
                        serviceId,
                        staffId,
                        startTime: startAt,
                        partySize: args.partySize,
                    }),
                ]);
                if (!slot.isAvailable) {
                    throw new ConflictException({ code: "SLOT_UNAVAILABLE", message: "That slot is not currently returned as valid by AvailabilityModule." });
                }
                endAt = slot.endTime;

                // Resolve customer identity from authenticated session or guest inputs
                const customer = await this.resolveCustomer(ctx);
                const customerId = customer?.id || ctx.customerId || null;
                const guestName = customer?.fullName || args.guestName || "Portal Customer";
                const guestEmail = customer?.email || args.guestEmail || "customer@portal.local";
                const guestPhone = customer?.phone || args.guestPhone || null;

                // Rule 11: Single Active Hold per Customer - Cancel previous active holds before acquiring new slot
                if (customerId) {
                    const existingActiveHolds = await this.prisma.bookingHold.findMany({
                        where: {
                            organizationId: ctx.organizationId,
                            customerId,
                            status: "ACTIVE",
                            expiresAt: { gt: new Date() },
                        },
                    });
                    for (const prevHold of existingActiveHolds) {
                        await this.holds.cancelHold(prevHold.id, ctx.organizationId).catch(() => {});
                    }
                }

                // Create the authoritative BookingHold in PostgreSQL with ScheduleGuard pessimistic locking
                const hold = await this.holds.createHold({
                    organizationId: ctx.organizationId,
                    locationId,
                    serviceId,
                    staffId: staffId || null,
                    startAt,
                    endAt,
                    partySize: args.partySize || 1,
                    customerId,
                    guestName,
                    guestEmail,
                    guestPhone,
                    idempotencyKey: `ai_hold_${conversationId}_${Date.now()}`,
                    createdById: this.uuidOrNull(ctx.subjectId),
                });

                // Check for required intake questions and safely unlock payment gate if none required
                const applicableForms = await this.prisma.intakeForm.findMany({
                    where: {
                        organizationId: ctx.organizationId,
                        archivedAt: null,
                        isActive: true,
                        OR: [
                            { isGlobal: true },
                            { serviceIntakeForms: { some: { serviceId } } },
                        ],
                    },
                    include: {
                        serviceIntakeForms: { where: { serviceId } },
                    },
                });
                const hasRequiredQuestions = applicableForms.some((form) => {
                    const isFormRequired = form.isGlobal || form.serviceIntakeForms.some((s) => s.isRequired);
                    const fields = Array.isArray(form.fields) ? (form.fields as any[]) : [];
                    return isFormRequired && fields.some((f) => f.required);
                });

                if (!hasRequiredQuestions) {
                    await this.prisma.bookingHold.update({
                        where: { id: hold.id },
                        data: {
                            guestName,
                            guestEmail,
                            guestPhone,
                            detailsCompletedAt: new Date(),
                        },
                    });
                }

                const staff = staffId ? await this.staff.getStaffById(ctx.organizationId, staffId).catch(() => null) : null;
                const holdQuote = ((hold?.quoteSnapshot || {}) as Record<string, any>);
                const totalCents = Number(quote?.totalCents ?? holdQuote.totalCents ?? service.priceCents ?? 0);
                const payableNowCents = Number(holdQuote.payableNowCents ?? quote?.depositCents ?? (quote as any)?.depositRequiredCents ?? 0);
                const remainingBalanceCents = Number(holdQuote.remainingBalanceCents ?? Math.max(0, totalCents - payableNowCents));
                const currency = String(quote?.currency || holdQuote.currency || service.currency || "USD");
                const holdExpiresAt = new Date(hold.expiresAt);
                const holdId = hold.id;

                const org = await this.prisma.organization.findUnique({
                    where: { id: ctx.organizationId },
                    select: { slug: true, brandName: true, name: true },
                });

                const authoritativeData = {
                    holdId,
                    service: {
                        id: service.id,
                        name: service.name,
                        durationMin: service.durationMin,
                        priceCents: totalCents,
                        currency,
                    },
                    location: {
                        id: location.id,
                        name: location.name,
                        address: [location.address, location.city].filter(Boolean).join(", ") || null,
                    },
                    staff: staff ? { id: staff.id, name: staff.displayName } : null,
                    startAt: slot.startTime,
                    endAt: slot.endTime,
                    price: quote,
                    totalCents,
                    payableNowCents,
                    remainingBalanceCents,
                    currency,
                    depositType: service.depositType || "NONE",
                    depositValue: service.depositValue || 0,
                    paymentRequired: payableNowCents > 0,
                    expiresAt: holdExpiresAt.toISOString(),
                    holdDurationMinutes: policy?.holdDurationMinutes ?? 10,
                    cancelCutoffHours: policy?.cancelCutoffHours ?? 24,
                    rescheduleCutoffHours: policy?.rescheduleCutoffHours ?? 12,
                    slug: org?.slug || "",
                    guestToken: (hold as any)?.guestToken || null,
                    checkoutUrl: payableNowCents > 0 ? `/book/${org?.slug || ctx.organizationId}?holdId=${holdId}&fromAi=true${(hold as any)?.guestToken ? `&guestToken=${encodeURIComponent((hold as any).guestToken)}` : ""}` : null,
                };

                return this.proposalCard(
                    conversationId,
                    "confirmBooking",
                    { holdId },
                    ctx,
                    authoritativeData,
                    holdExpiresAt
                );
            }
            case "releaseBookingHold": {
                let holdId = args.holdId;
                if (!holdId) {
                    const customer = await this.resolveCustomer(ctx);
                    const latestHold = await this.prisma.bookingHold.findFirst({
                        where: {
                            organizationId: ctx.organizationId,
                            status: "ACTIVE",
                            expiresAt: { gt: new Date() },
                            ...(customer ? { customerId: customer.id } : {}),
                        },
                        orderBy: { createdAt: "desc" },
                    });
                    if (latestHold) {
                        holdId = latestHold.id;
                    }
                }
                if (!holdId) {
                    return this.customCard("HOLD_RELEASED", name, "No Active Hold Found", {
                        released: false,
                        message: "You do not have any active reservation hold to release.",
                    });
                }
                await this.holds.cancelHold(holdId, ctx.organizationId);
                return this.customCard("HOLD_RELEASED", name, "Seat Hold Released", {
                    holdId,
                    status: "CANCELLED",
                    released: true,
                    message: "Your reservation hold has been released. The slot is now available for other customers.",
                });
            }
            case "confirmBooking": {
                this.requirePermissionOrCustomer(ctx, PermissionKey.APPOINTMENT_CREATE);
                const hold = await this.holds.getHold(args.holdId, ctx.organizationId);
                await this.assertCustomerOwnership(hold.customerId, ctx);
                this.assertLocationScope(ctx, hold.locationId);
                const quote = (hold.quoteSnapshot || {}) as Record<string, any>;
                const service = await this.services.getServiceById(ctx.organizationId, hold.serviceId).catch(() => null);
                const location = await this.locations.getLocationById(ctx.organizationId, hold.locationId).catch(() => null);
                const staff = hold.staffId ? await this.staff.getStaffById(ctx.organizationId, hold.staffId).catch(() => null) : null;
                const policy = await this.policies.resolvePolicy(ctx.organizationId, hold.locationId, hold.serviceId).catch(() => null);
                const org = await this.prisma.organization.findUnique({
                    where: { id: ctx.organizationId },
                    select: { slug: true, brandName: true, name: true },
                });

                const totalCents = Number(quote.totalCents ?? quote.priceCents ?? service?.priceCents ?? 0);
                const payableNowCents = Number(quote.payableNowCents ?? quote.depositAmountCents ?? 0);
                const remainingBalanceCents = Number(quote.remainingBalanceCents ?? Math.max(0, totalCents - payableNowCents));
                const currency = String(quote.currency || service?.currency || "USD");

                const authoritativeData = {
                    holdId: hold.id,
                    status: hold.status,
                    service: {
                        id: service?.id || hold.serviceId,
                        name: service?.name || "Service",
                        durationMin: service?.durationMin || 60,
                        priceCents: totalCents,
                        currency,
                    },
                    location: {
                        id: location?.id || hold.locationId,
                        name: location?.name || "Location",
                        address: [location?.address, location?.city].filter(Boolean).join(", ") || null,
                    },
                    staff: staff ? { id: staff.id, name: staff.displayName } : null,
                    startAt: hold.startAt instanceof Date ? hold.startAt.toISOString() : String(hold.startAt || new Date().toISOString()),
                    endAt: hold.endAt instanceof Date ? hold.endAt.toISOString() : String(hold.endAt || new Date().toISOString()),
                    totalCents,
                    payableNowCents,
                    remainingBalanceCents,
                    currency,
                    depositType: service?.depositType || "NONE",
                    depositValue: service?.depositValue || 0,
                    paymentRequired: payableNowCents > 0,
                    expiresAt: hold.expiresAt.toISOString(),
                    holdDurationMinutes: policy?.holdDurationMinutes ?? 10,
                    cancelCutoffHours: policy?.cancelCutoffHours ?? 24,
                    slug: org?.slug || "",
                    checkoutUrl: payableNowCents > 0 ? `/book/${org?.slug || ctx.organizationId}?holdId=${hold.id}&fromAi=true` : null,
                };
                return this.proposalCard(conversationId, name, args, ctx, authoritativeData, hold.expiresAt);
            }
            case "rescheduleBooking": {
                let bookingId = args.bookingId;
                if (!bookingId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) {
                    const customer = await this.resolveCustomer(ctx);
                    if (customer) {
                        const target = await this.prisma.appointment.findFirst({
                            where: {
                                organizationId: ctx.organizationId,
                                customerId: customer.id,
                                status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
                                startAt: { gte: new Date() },
                            },
                            orderBy: { startAt: "asc" },
                        });
                        if (target) bookingId = target.id;
                    }
                }
                const booking = await this.getAuthorizedBooking(bookingId, ctx, PermissionKey.APPOINTMENT_MUTATE);
                this.assertLocationScope(ctx, booking.locationId);
                let targetStaffId = args.newStaffId || booking.staffId || undefined;
                if (targetStaffId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetStaffId)) {
                    const allStaff = await this.staff.getStaffMembers(ctx.organizationId).catch(() => []);
                    const matched = allStaff.find((s: any) => s.displayName?.toLowerCase().includes(targetStaffId.toLowerCase()));
                    targetStaffId = matched?.id;
                }
                let [slot, quote] = await Promise.all([
                    this.availability.validateAvailability({ organizationId: ctx.organizationId, locationId: booking.locationId, serviceId: booking.serviceId, staffId: targetStaffId, startTime: args.newStartAt, partySize: booking.partySize }),
                    this.pricing.calculateQuote(ctx.organizationId, { serviceId: booking.serviceId, staffId: targetStaffId, locationId: booking.locationId }),
                ]);
                if (!slot.isAvailable && args.autoAssignSpecialist !== false) {
                    const searchRes: any = await this.availability.searchAvailability({
                        organizationId: ctx.organizationId,
                        locationId: booking.locationId,
                        serviceId: booking.serviceId,
                        startDate: args.newStartAt.slice(0, 10),
                        endDate: args.newStartAt.slice(0, 10),
                    }).catch(() => ({ slots: [] }));
                    const matching = (searchRes?.slots || []).find((s: any) =>
                        (s.startUtc === args.newStartAt || s.slotUtc === args.newStartAt) && s.available !== false
                    );
                    if (matching && matching.staffId) {
                        const validated = await this.availability.validateAvailability({
                            organizationId: ctx.organizationId,
                            locationId: booking.locationId,
                            serviceId: booking.serviceId,
                            staffId: matching.staffId,
                            startTime: args.newStartAt,
                            partySize: booking.partySize,
                        }).catch(() => null);
                        if (validated && validated.isAvailable) {
                            slot = validated;
                            targetStaffId = matching.staffId;
                        }
                    }
                }
                if (!slot.isAvailable) {
                    throw new ConflictException({
                        code: "SLOT_UNAVAILABLE",
                        message: "The requested reschedule slot is currently fully booked. You can request to join the Priority Reschedule Waitlist to automatically claim the next opening.",
                    });
                }
                const priceDeltaCents = quote.totalCents - booking.priceCents;
                if (priceDeltaCents !== 0) throw new ConflictException({ code: "AI_RESCHEDULE_PAYMENT_IMPLICATION", message: "This reschedule changes the authoritative price and must continue through BookPro's normal commercial flow." });
                return this.proposalCard(conversationId, name, { ...args, bookingId }, ctx, {
                    bookingId: booking.id, bookingVersion: booking.version, service: { id: booking.service.id, name: booking.service.name }, location: { id: booking.location.id, name: booking.location.name }, staff: slot.staffId,
                    oldStartAt: booking.startAt.toISOString(), oldEndAt: booking.endAt.toISOString(), newStartAt: slot.startTime, newEndAt: slot.endTime,
                    priceCents: booking.priceCents, currency: booking.currency, priceDeltaCents, quoteVersion: quote.quoteVersion,
                });
            }
            case "autoRescheduleAppointment": {
                const customer = await this.resolveCustomer(ctx);
                if (!customer) throw new NotFoundException({ code: "CUSTOMER_NOT_FOUND", message: "Customer profile required." });

                let booking = null;
                if (args.bookingId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.bookingId)) {
                    booking = await this.getAuthorizedBooking(args.bookingId, ctx, PermissionKey.APPOINTMENT_MUTATE);
                } else {
                    booking = await this.prisma.appointment.findFirst({
                        where: {
                            organizationId: ctx.organizationId,
                            customerId: customer.id,
                            status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
                            startAt: { gte: new Date() },
                        },
                        include: { service: true, location: true, staff: true },
                        orderBy: { startAt: "asc" },
                    });
                }
                if (!booking) {
                    throw new NotFoundException({ code: "NO_UPCOMING_BOOKING", message: "No active upcoming appointment found to reschedule." });
                }

                const targetDate = args.preferredDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
                const searchRes: any = await this.availability.searchAvailability({
                    organizationId: ctx.organizationId,
                    locationId: booking.locationId,
                    serviceId: booking.serviceId,
                    startDate: targetDate,
                    endDate: targetDate,
                }).catch(() => ({ slots: [] }));

                const validSlots = (searchRes?.slots || []).filter((s: any) => s.available !== false);

                if (validSlots.length > 0) {
                    const chosenSlot = validSlots[0];
                    const durationMin = booking.service?.durationMin || 30;
                    const newStartAt = chosenSlot.startUtc || chosenSlot.slotUtc;
                    const newEndAt = new Date(new Date(newStartAt).getTime() + durationMin * 60 * 1000).toISOString();

                    return this.proposalCard(conversationId, "rescheduleBooking", {
                        bookingId: booking.id,
                        newStartAt,
                        newEndAt,
                        newStaffId: chosenSlot.staffId,
                        autoAssignSpecialist: true,
                    }, ctx, {
                        bookingId: booking.id,
                        bookingVersion: booking.version,
                        service: { id: booking.service.id, name: booking.service.name },
                        location: { id: booking.location.id, name: booking.location.name },
                        staff: chosenSlot.staffId,
                        oldStartAt: booking.startAt.toISOString(),
                        oldEndAt: booking.endAt.toISOString(),
                        newStartAt,
                        newEndAt,
                        priceCents: booking.priceCents,
                        currency: booking.currency,
                        priceDeltaCents: 0,
                    });
                } else {
                    // Fully booked -> Automatic Priority Reschedule Waitlist Queue Placement
                    const entry = await this.waitlist.createSmartRescheduleWaitlist(
                        ctx.organizationId,
                        customer.id,
                        {
                            appointmentId: booking.id,
                            preferredDateRange: {
                                start: `${targetDate}T00:00:00.000Z`,
                                end: `${targetDate}T23:59:59.999Z`,
                            },
                            timePreference: args.timePreference || "ANY",
                            notes: "Automated Priority Reschedule Queue registration via AI Concierge",
                        }
                    );

                    return this.customCard("WAITLIST_STATUS", name, "Priority Reschedule Queue Registered", {
                        waitlistEntryId: entry.id,
                        status: "ACTIVE",
                        serviceName: booking.service?.name,
                        targetDate,
                        priority: "HIGH",
                        message: "Target date is currently full. You have been registered in the Priority Reschedule Waitlist. Your existing appointment remains secure, and the automated schedule engine will immediately claim an opening and assign a specialist the moment one opens.",
                    });
                }
            }
            case "cancelBooking": {
                let bookingId = args.bookingId;
                if (!bookingId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) {
                    const customer = await this.resolveCustomer(ctx);
                    if (customer) {
                        const target = await this.prisma.appointment.findFirst({
                            where: {
                                organizationId: ctx.organizationId,
                                customerId: customer.id,
                                status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
                                startAt: { gte: new Date() },
                            },
                            orderBy: { startAt: "asc" },
                        });
                        if (target) bookingId = target.id;
                    }
                }
                const booking = await this.getAuthorizedBooking(bookingId, ctx, PermissionKey.APPOINTMENT_CANCEL);
                const quote = await this.policies.getCancellationQuote(ctx.organizationId, booking.id);
                return this.proposalCard(conversationId, name, { ...args, bookingId }, ctx, {
                    bookingId: booking.id, bookingVersion: booking.version, service: { id: booking.service.id, name: booking.service.name }, location: { id: booking.location.id, name: booking.location.name }, staff: booking.staff ? { id: booking.staff.id, name: booking.staff.displayName } : null,
                    startAt: booking.startAt.toISOString(), priceCents: booking.priceCents, currency: booking.currency,
                    feeCents: quote.feeCents, refundableCents: quote.refundableCents, policyProvenance: quote.policyProvenance, quoteVersion: quote.quoteVersion, quoteExpiresAt: quote.expiresAt,
                }, new Date(quote.expiresAt));
            }
            case "joinWaitlist": {
                this.requirePermissionOrCustomer(ctx, PermissionKey.APPOINTMENT_CREATE);
                if (args.locationId) this.assertLocationScope(ctx, args.locationId);
                const service = await this.services.getServiceById(ctx.organizationId, args.serviceId);
                const location = args.locationId ? await this.locations.getLocationById(ctx.organizationId, args.locationId) : null;
                const staff = args.staffId ? await this.staff.getStaffById(ctx.organizationId, args.staffId) : null;
                return this.proposalCard(conversationId, name, args, ctx, {
                    service: { id: service.id, name: service.name, priceCents: service.priceCents, currency: service.currency },
                    location: location ? { id: location.id, name: location.name } : null, staff: staff ? { id: staff.id, name: staff.displayName } : null,
                    startWindowDate: args.startWindowDate, endWindowDate: args.endWindowDate, timePreference: args.timePreference, partySize: args.partySize,
                });
            }
            case "leaveWaitlist": {
                const customer = await this.resolveCustomer(ctx);
                let waitlistEntryId = args.waitlistEntryId;
                if (!waitlistEntryId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(waitlistEntryId)) {
                    if (customer) {
                        const target = await this.prisma.waitlistEntry.findFirst({
                            where: { organizationId: ctx.organizationId, customerId: customer.id, status: "ACTIVE" },
                            orderBy: { createdAt: "desc" },
                        });
                        if (target) waitlistEntryId = target.id;
                    }
                }
                const entry = await this.prisma.waitlistEntry.findFirst({
                    where: { id: waitlistEntryId, organizationId: ctx.organizationId },
                    include: { service: { select: { name: true } } },
                });
                if (!entry) throw new NotFoundException({ code: "WAITLIST_ENTRY_NOT_FOUND", message: "Waitlist entry not found." });
                if (ctx.actorType === ActorType.CUSTOMER && customer && entry.customerId !== customer.id) {
                    throw new NotFoundException({ code: "WAITLIST_ENTRY_NOT_FOUND", message: "Waitlist entry not found." });
                }
                return this.proposalCard(conversationId, name, { ...args, waitlistEntryId }, ctx, {
                    waitlistEntryId: entry.id,
                    serviceName: entry.service.name,
                    status: entry.status,
                    reason: args.reason || "Customer requested withdrawal",
                });
            }
            case "getMyBillingHistory": {
                const customer = await this.resolveCustomer(ctx);
                if (!customer) {
                    throw new NotFoundException({
                        code: "CUSTOMER_PROFILE_NOT_FOUND",
                        message: "Unable to find your verified customer billing profile.",
                    });
                }
                const payments = await this.prisma.paymentRecord.findMany({
                    where: {
                        organizationId: ctx.organizationId,
                        OR: [
                            { appointment: { customerId: customer.id } },
                            { bookingHold: { customerId: customer.id } },
                        ],
                    },
                    include: {
                        refunds: true,
                        appointment: {
                            include: {
                                service: { select: { name: true } },
                                staff: { select: { displayName: true } },
                            },
                        },
                    },
                    orderBy: { createdAt: "desc" },
                    take: args.limit || 10,
                });

                const paymentItems = payments.map((p: any) => ({
                    id: p.id,
                    amountCents: p.amountCents,
                    currency: p.currency,
                    status: p.status,
                    paymentMethodType: p.provider,
                    createdAt: p.createdAt.toISOString(),
                    serviceName: p.appointment?.service?.name || "Service",
                    staffName: p.appointment?.staff?.displayName || null,
                    refundsCount: p.refunds?.length || 0,
                    totalRefundedCents: (p.refunds || []).reduce((acc: number, r: any) => acc + (r.status === "SUCCEEDED" ? r.amountCents : 0), 0),
                }));

                return this.customCard("TOOL_RESULT", name, "Billing & Payment History", {
                    totalPayments: paymentItems.length,
                    payments: paymentItems,
                });
            }

            // =========================================================================
            // OWNER & STAFF OPERATIONS TOOLS (Enterprise Business Role Execution)
            // =========================================================================
            case "getBusinessOverview": {
                if (!this.dashboardOverview) {
                    throw new BadRequestException({ code: "OVERVIEW_UNAVAILABLE", message: "Dashboard overview service is unavailable." });
                }
                const overview = await this.dashboardOverview.getDashboardOverview(ctx.organizationId, args.locationId);
                return this.customCard("BUSINESS_OVERVIEW", name, "Executive Dashboard Overview", overview as any);
            }
            case "getAppointmentsAgenda": {
                let startDate = args.startDate;
                let endDate = args.endDate;
                let isHistoricalAll = false;

                if (startDate === "all") {
                    startDate = undefined;
                    endDate = undefined;
                    isHistoricalAll = true;
                } else if (!startDate || startDate === "today") {
                    const now = new Date();
                    startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
                    endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();
                } else if (startDate === "tomorrow") {
                    const tom = new Date(Date.now() + 86400000);
                    startDate = new Date(Date.UTC(tom.getUTCFullYear(), tom.getUTCMonth(), tom.getUTCDate(), 0, 0, 0, 0)).toISOString();
                    endDate = new Date(Date.UTC(tom.getUTCFullYear(), tom.getUTCMonth(), tom.getUTCDate(), 23, 59, 59, 999)).toISOString();
                } else if (!endDate) {
                    endDate = `${startDate.slice(0, 10)}T23:59:59.999Z`;
                }

                const appointments = await this.appointments.getAppointments({
                    organizationId: ctx.organizationId,
                    locationId: args.locationId,
                    staffId: args.staffId,
                    startDate,
                    endDate,
                    status: args.status as any,
                });
                const items = appointments.map((a: any) => ({
                    id: a.id,
                    startAt: a.startAt.toISOString(),
                    endAt: a.endAt.toISOString(),
                    status: a.status,
                    paymentStatus: a.paymentStatus,
                    customerName: a.customer?.fullName || "Guest",
                    customerEmail: a.customer?.email || null,
                    customerPhone: a.customer?.phone || null,
                    serviceName: a.service?.name,
                    staffName: a.staff?.displayName || null,
                    locationName: a.location?.name,
                    priceCents: a.priceCents,
                    currency: a.currency,
                }));

                let upcomingCount = 0;
                if (!isHistoricalAll && items.length === 0) {
                    const upcomingAppts = await this.appointments.getAppointments({
                        organizationId: ctx.organizationId,
                        startDate: new Date().toISOString(),
                        endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
                        status: "CONFIRMED" as any,
                    }).catch(() => []);
                    upcomingCount = upcomingAppts.length;
                }

                return this.customCard("STAFF_AGENDA", name, "Appointments Agenda", {
                    count: items.length,
                    filterDate: isHistoricalAll ? "All Time" : (startDate?.slice(0, 10) || "Today"),
                    isToday: !isHistoricalAll && (!args.startDate || args.startDate === "today"),
                    upcomingCount,
                    appointments: items,
                });
            }
            case "scheduleStaffAppointment": {
                let locationId = args.locationId;
                if (!locationId) {
                    const locations = await this.locations.getLocations(ctx.organizationId);
                    if (locations.length > 0) locationId = locations[0].id;
                }
                const service = await this.services.getServiceById(ctx.organizationId, args.serviceId);
                const durationMin = service.durationMin || 30;
                const endAt = args.endAt || new Date(new Date(args.startAt).getTime() + durationMin * 60 * 1000).toISOString();

                let staffId = args.staffId;
                if (!staffId && locationId) {
                    const eligible = await this.availability.searchAvailability({
                        organizationId: ctx.organizationId,
                        locationId,
                        serviceId: service.id,
                        startDate: args.startAt.slice(0, 10),
                        endDate: args.startAt.slice(0, 10),
                    }).catch(() => null);
                    if (eligible && (eligible as any).slots) {
                        const matchingSlot = (eligible as any).slots.find((s: any) => s.startUtc === args.startAt || s.slotUtc === args.startAt);
                        if (matchingSlot && matchingSlot.staffId) staffId = matchingSlot.staffId;
                    }
                }

                return this.proposalCard(conversationId, name, { ...args, locationId, staffId, endAt }, ctx, {
                    serviceName: service.name,
                    serviceId: service.id,
                    locationId,
                    staffId,
                    startAt: args.startAt,
                    endAt,
                    customerName: args.customerName,
                    customerEmail: args.customerEmail,
                    customerPhone: args.customerPhone,
                    paymentStatus: args.paymentStatus || "UNPAID",
                    internalNotes: args.internalNotes,
                    overrideReason: args.overrideReason,
                    priceCents: service.priceCents,
                    currency: service.currency,
                });
            }
            case "rescheduleStaffAppointment": {
                const appt: any = await this.getAuthorizedBooking(args.appointmentId, ctx, PermissionKey.APPOINTMENT_MUTATE);
                const durationMin = appt.service?.durationMin || 30;
                const newEndAt = args.newEndAt || new Date(new Date(args.newStartAt).getTime() + durationMin * 60 * 1000).toISOString();
                return this.proposalCard(conversationId, name, { ...args, newEndAt }, ctx, {
                    appointmentId: appt.id,
                    currentStartAt: appt.startAt.toISOString(),
                    newStartAt: args.newStartAt,
                    newEndAt,
                    newStaffId: args.newStaffId || appt.staffId,
                    serviceName: appt.service?.name,
                    customerName: appt.customer?.fullName,
                    reason: args.reason,
                });
            }
            case "cancelStaffAppointment": {
                const appt: any = await this.getAuthorizedBooking(args.appointmentId, ctx, PermissionKey.APPOINTMENT_CANCEL);
                return this.proposalCard(conversationId, name, args, ctx, {
                    appointmentId: appt.id,
                    startAt: appt.startAt.toISOString(),
                    serviceName: appt.service?.name,
                    customerName: appt.customer?.fullName,
                    reason: args.reason,
                });
            }
            case "updateAppointmentStatus": {
                await this.getAuthorizedBooking(args.appointmentId, ctx, PermissionKey.APPOINTMENT_MUTATE);
                const appt = await this.appointments.transitionStatus(
                    args.appointmentId,
                    ctx.organizationId,
                    args.status as any,
                    "STAFF",
                    ctx.subjectId
                );
                return this.confirmedCard(name, "Appointment Status Updated", {
                    appointmentId: appt.id,
                    newStatus: appt.status,
                    version: appt.version,
                });
            }
            case "listBusinessServices": {
                const services = await this.services.getServices(ctx.organizationId, args.activeOnly ?? false);
                const filtered = args.category
                    ? services.filter((s: any) => s.category?.toLowerCase() === args.category?.toLowerCase())
                    : services;
                return this.customCard("TOOL_RESULT", name, "Business Services Directory", {
                    count: filtered.length,
                    services: filtered.map((s: any) => ({
                        id: s.id,
                        name: s.name,
                        category: s.category,
                        durationMin: s.durationMin,
                        priceCents: s.priceCents,
                        currency: s.currency,
                        isActive: s.isActive,
                        depositType: s.depositType,
                        depositValue: s.depositValue,
                    })),
                });
            }
            case "createBusinessService": {
                return this.proposalCard(conversationId, name, args, ctx, {
                    name: args.name,
                    category: args.category,
                    durationMin: args.durationMin,
                    priceCents: args.priceCents,
                    currency: args.currency || "USD",
                    depositType: args.depositType || "NONE",
                    depositValue: args.depositValue || 0,
                    description: args.description,
                });
            }
            case "updateBusinessService": {
                const existing = await this.services.getServiceById(ctx.organizationId, args.serviceId);
                return this.proposalCard(conversationId, name, args, ctx, {
                    serviceId: existing.id,
                    currentName: existing.name,
                    name: args.name || existing.name,
                    priceCents: args.priceCents ?? existing.priceCents,
                    durationMin: args.durationMin ?? existing.durationMin,
                    isActive: args.isActive ?? existing.isActive,
                    depositType: args.depositType ?? existing.depositType,
                    depositValue: args.depositValue ?? existing.depositValue,
                });
            }
            case "getStaffRoster": {
                const roster = await this.staff.getStaffMembers(ctx.organizationId, {
                    locationId: args.locationId,
                    activeOnly: args.activeOnly ?? false,
                });
                return this.customCard("STAFF_ROSTER", name, "Staff Roster Directory", {
                    count: roster.length,
                    staff: roster.map((s: any) => ({
                        id: s.id,
                        displayName: s.displayName,
                        title: s.title,
                        email: s.membership?.user?.email,
                        phone: s.membership?.user?.phone,
                        isActive: s.isActive,
                        bookingVisible: s.bookingVisible,
                        locations: s.staffLocations?.map((l: any) => l.location?.name).filter(Boolean) || [],
                        services: s.staffServices?.map((sv: any) => sv.service?.name).filter(Boolean) || [],
                    })),
                });
            }
            case "getStaffSchedule": {
                const staff = await this.staff.getStaffById(ctx.organizationId, args.staffId);
                const targetDate = args.date || new Date().toISOString().slice(0, 10);
                const startOfDay = new Date(`${targetDate}T00:00:00.000Z`);
                const endOfDay = new Date(`${targetDate}T23:59:59.999Z`);
                const appointments = await this.appointments.getAppointments({
                    organizationId: ctx.organizationId,
                    staffId: args.staffId,
                    startDate: startOfDay.toISOString(),
                    endDate: endOfDay.toISOString(),
                });
                return this.customCard("STAFF_AGENDA", name, `Staff Schedule: ${staff.displayName}`, {
                    staffId: staff.id,
                    staffDisplayName: staff.displayName,
                    date: targetDate,
                    count: appointments.length,
                    appointments: appointments.map((a: any) => ({
                        id: a.id,
                        startAt: a.startAt.toISOString(),
                        endAt: a.endAt.toISOString(),
                        status: a.status,
                        serviceName: a.service?.name,
                        customerName: a.customer?.fullName || "Guest",
                    })),
                });
            }
            case "updateStaffStatus": {
                const staff = await this.staff.getStaffById(ctx.organizationId, args.staffId);
                return this.proposalCard(conversationId, name, args, ctx, {
                    staffId: staff.id,
                    displayName: staff.displayName,
                    currentIsActive: staff.isActive,
                    currentBookingVisible: staff.bookingVisible,
                    targetIsActive: args.isActive ?? staff.isActive,
                    targetBookingVisible: args.bookingVisible ?? staff.bookingVisible,
                    title: args.title ?? staff.title,
                });
            }
            case "searchCustomers": {
                if (!this.crm) {
                    throw new BadRequestException({ code: "CRM_UNAVAILABLE", message: "CRM service is unavailable." });
                }
                const customers = await this.crm.listCustomers(ctx.organizationId, {
                    search: args.query,
                    tag: args.tag,
                });
                const limited = customers.slice(0, args.limit || 10);
                return this.customCard("CUSTOMER_CRM_LIST", name, "Customer CRM Directory", {
                    count: limited.length,
                    customers: limited,
                });
            }
            case "getCustomerProfile": {
                if (!this.crm) {
                    throw new BadRequestException({ code: "CRM_UNAVAILABLE", message: "CRM service is unavailable." });
                }
                const details = await this.crm.getCustomerDetails(ctx.organizationId, args.customerId, false);
                return this.customCard("CUSTOMER_PROFILE", name, `Customer Profile: ${details.fullName}`, details as any);
            }
            case "addCustomerInternalNote": {
                if (!this.crm) {
                    throw new BadRequestException({ code: "CRM_UNAVAILABLE", message: "CRM service is unavailable." });
                }
                const note = await this.crm.addCustomerNote(ctx.organizationId, args.customerId, ctx.subjectId, args.note, true);
                return this.confirmedCard(name, "Staff Internal Note Added", {
                    noteId: note.id,
                    customerId: args.customerId,
                    noteText: note.noteText,
                    createdAt: note.createdAt.toISOString(),
                });
            }
            case "tagCustomer": {
                if (!this.crm) {
                    throw new BadRequestException({ code: "CRM_UNAVAILABLE", message: "CRM service is unavailable." });
                }
                const updated = await this.crm.manageCustomerTag(
                    ctx.organizationId,
                    args.customerId,
                    ctx.subjectId,
                    args.tag,
                    args.action === "ADD" ? "add" : "remove"
                );
                return this.confirmedCard(name, `Customer Tag ${args.action === "ADD" ? "Added" : "Removed"}`, {
                    customerId: updated.id,
                    tags: updated.tags,
                });
            }
            case "getWaitlistQueue": {
                const queue = await this.prisma.waitlistEntry.findMany({
                    where: {
                        organizationId: ctx.organizationId,
                        ...(args.serviceId ? { serviceId: args.serviceId } : {}),
                        ...(args.locationId ? { locationId: args.locationId } : {}),
                        ...(args.status ? { status: args.status as any } : { status: "ACTIVE" }),
                    },
                    include: {
                        service: { select: { id: true, name: true, durationMin: true } },
                        location: { select: { id: true, name: true } },
                        staff: { select: { id: true, displayName: true } },
                        customer: { select: { id: true, fullName: true, email: true, phone: true } },
                    },
                    orderBy: { createdAt: "asc" },
                });
                return this.customCard("WAITLIST_QUEUE", name, "Waitlist Priority Queue", {
                    count: queue.length,
                    queue: queue.map((e: any) => ({
                        id: e.id,
                        customerName: e.customer?.fullName || "Guest",
                        customerEmail: e.customer?.email || null,
                        customerPhone: e.customer?.phone || null,
                        serviceName: e.service?.name,
                        serviceDurationMin: e.service?.durationMin,
                        locationName: e.location?.name,
                        preferredStaffName: e.staff?.displayName || "Any Available",
                        status: e.status,
                        startWindowDate: e.startWindowDate.toISOString().slice(0, 10),
                        endWindowDate: e.endWindowDate.toISOString().slice(0, 10),
                        timePreference: e.timePreference,
                        partySize: e.partySize,
                        notes: e.notes,
                        createdAt: e.createdAt.toISOString(),
                    })),
                });
            }
            case "issueManualWaitlistOffer": {
                const entry: any = await this.prisma.waitlistEntry.findFirst({
                    where: { id: args.waitlistEntryId, organizationId: ctx.organizationId },
                    include: { service: true, customer: true },
                });
                if (!entry) throw new NotFoundException({ code: "WAITLIST_ENTRY_NOT_FOUND", message: "Waitlist entry not found." });
                return this.proposalCard(conversationId, name, args, ctx, {
                    waitlistEntryId: entry.id,
                    customerName: entry.customer?.fullName || "Guest",
                    serviceName: entry.service?.name,
                    slotStartAt: args.slotStartAt,
                    slotEndAt: args.slotEndAt,
                    staffId: args.staffId,
                    expiryMinutes: args.expiryMinutes,
                });
            }
            case "getScheduleGapsAndRecovery": {
                const gaps = this.gapDetection
                    ? await this.gapDetection.scanAndDetectGaps(ctx.organizationId, {
                        startDate: args.startDate,
                        endDate: args.endDate,
                    })
                    : [];
                const recovery = this.recoveredRevenue
                    ? await this.recoveredRevenue.getRecoveredRevenueStats(ctx.organizationId)
                    : {
                        totalRecoveredRevenueCents: 0,
                        recoveredBookingsCount: 0,
                        averageRecoveredBookingCents: 0,
                        activeOptimizerOpportunitiesCount: 0,
                        potentialOpportunityRevenueCents: 0,
                    };
                return this.customCard("OPTIMIZER_INSIGHTS", name, "Schedule Gaps & Revenue Optimization", {
                    gapsCount: gaps.length,
                    gaps,
                    recoveredRevenue: recovery,
                });
            }
            case "getScheduleInsights": {
                const insights = this.scheduleInsights
                    ? await this.scheduleInsights.getInsights(ctx.organizationId, {
                        status: args.status as any,
                    })
                    : [];
                return this.customCard("OPTIMIZER_INSIGHTS", name, "Schedule Insights", {
                    count: insights.length,
                    insights,
                });
            }
            case "getMarketingTelemetry": {
                if (!this.marketing) {
                    throw new BadRequestException({ code: "MARKETING_UNAVAILABLE", message: "Marketing service unavailable." });
                }
                const telemetry = await this.marketing.getOverviewStats({
                    organizationId: ctx.organizationId,
                    subjectId: ctx.subjectId,
                    actorType: ctx.actorType,
                    permissions: ctx.permissions,
                    correlationId: ctx.correlationId,
                } as any);
                return this.customCard("MARKETING_OVERVIEW", name, "Marketing & Audience Telemetry", telemetry as any);
            }
            case "createDiscountCoupon": {
                return this.proposalCard(conversationId, name, args, ctx, {
                    code: args.code.toUpperCase(),
                    discountType: args.discountType,
                    discountValue: args.discountValue,
                    validUntil: args.validUntil,
                    usageLimit: args.usageLimit,
                    description: args.description,
                });
            }
            case "getCommissionsReport": {
                if (!this.commissions) {
                    throw new BadRequestException({ code: "COMMISSIONS_UNAVAILABLE", message: "Commissions service unavailable." });
                }
                const [summary, commissions] = await Promise.all([
                    this.commissions.getCommissionSummary(ctx.organizationId),
                    this.commissions.listCommissionLedger(ctx.organizationId, { staffId: args.staffId }),
                ]);
                return this.customCard("COMMISSIONS_REPORT", name, "Staff Commissions Report", {
                    summary,
                    commissionsCount: commissions.length,
                    commissions: commissions.slice(0, 50),
                });
            }
            case "getBusinessPolicies": {
                const policies = await this.policies.getPolicies(ctx.organizationId);
                return this.customCard("BUSINESS_POLICIES", name, "Business Policy Configurations", {
                    count: policies.length,
                    policies,
                });
            }
            case "updateBusinessPolicy": {
                return this.proposalCard(conversationId, name, args, ctx, {
                    minNoticeHours: args.minNoticeHours,
                    cancelCutoffHours: args.cancelCutoffHours,
                    cancelFeeType: args.cancelFeeType,
                    cancelFeeValue: args.cancelFeeValue,
                    rescheduleCutoffHours: args.rescheduleCutoffHours,
                    holdDurationMinutes: args.holdDurationMinutes,
                });
            }
        }
        throw new BadRequestException({ code: "AI_TOOL_NOT_REGISTERED", message: "The requested AI tool is not registered." });
    }

    private async executeConfirmedAction(action: string, args: any, ctx: TrustedAIContext, idempotencyKey: string): Promise<AIToolResult> {
        switch (action) {
            case "createBookingHold": {
                const hold = await this.holds.createHold({ ...args, organizationId: ctx.organizationId, customerId: ctx.customerId, idempotencyKey: `ai:${idempotencyKey}`, createdById: this.uuidOrNull(ctx.subjectId) });
                return this.confirmedCard(action, "Booking hold created", { holdId: hold.id, status: hold.status, expiresAt: hold.expiresAt.toISOString(), quote: hold.quoteSnapshot });
            }
            case "confirmBooking": {
                const hold = await this.holds.getHold(args.holdId, ctx.organizationId);
                const quote = (hold.quoteSnapshot || {}) as Record<string, any>;
                const payableNowCents = Number(quote.payableNowCents ?? quote.depositAmountCents ?? 0);
                const totalCents = Number(quote.totalCents ?? quote.priceCents ?? 0);

                if (payableNowCents > 0) {
                    const org = await this.prisma.organization.findUnique({
                        where: { id: ctx.organizationId },
                        select: { slug: true },
                    });
                    const guestToken = (hold as any)?.guestToken;
                    const checkoutUrl = `/book/${org?.slug || ctx.organizationId}?holdId=${hold.id}&fromAi=true${guestToken ? `&guestToken=${encodeURIComponent(guestToken)}` : ""}`;
                    return {
                        result: {
                            holdId: hold.id,
                            paymentRequired: true,
                            payableNowCents,
                            totalCents,
                            currency: String(quote.currency || "USD"),
                            checkoutUrl,
                            expiresAt: hold.expiresAt.toISOString(),
                        },
                        card: {
                            kind: "PAYMENT_HANDOFF",
                            toolName: action,
                            title: "Deposit Payment Required",
                            data: {
                                holdId: hold.id,
                                paymentRequired: true,
                                payableNowCents,
                                totalCents,
                                remainingBalanceCents: Math.max(0, totalCents - payableNowCents),
                                currency: String(quote.currency || "USD"),
                                checkoutUrl,
                                expiresAt: hold.expiresAt.toISOString(),
                            },
                        },
                        sideEffect: true,
                    };
                }

                const appointment = await this.appointments.convertHoldToAppointment({
                    organizationId: ctx.organizationId,
                    bookingHoldId: hold.id,
                    customerId: ctx.customerId || hold.customerId || undefined,
                    guestName: hold.guestName,
                    guestEmail: hold.guestEmail,
                    guestPhone: hold.guestPhone,
                    paymentStatus: "NOT_REQUIRED",
                    idempotencyKey: `ai_confirm_${idempotencyKey}`,
                });

                const detail: any = await this.appointments.getAppointmentDetail(appointment.id, ctx.organizationId);
                const receiptData = {
                    appointmentId: detail.id,
                    referenceCode: `BK-${detail.id.slice(0, 6).toUpperCase()}`,
                    status: detail.status,
                    paymentStatus: detail.paymentStatus,
                    serviceName: detail.service?.name,
                    durationMin: detail.service?.durationMin,
                    staffDisplayName: detail.staff?.displayName || null,
                    locationName: detail.location?.name,
                    locationAddress: [detail.location?.address, detail.location?.city].filter(Boolean).join(", ") || null,
                    startAt: detail.startAt.toISOString(),
                    endAt: detail.endAt.toISOString(),
                    priceCents: detail.priceCents,
                    paidCents: 0,
                    remainingBalanceCents: detail.priceCents,
                    currency: detail.currency,
                    emailConfirmationSent: Boolean(detail.customer?.email || hold.guestEmail),
                    customerEmail: detail.customer?.email || hold.guestEmail || null,
                    calendarDownloadUrl: `/api/v1/appointments/public/${detail.id}/calendar.ics`,
                };

                return {
                    result: receiptData,
                    card: {
                        kind: "BOOKING_RECEIPT",
                        toolName: action,
                        title: "Reservation Confirmed",
                        data: receiptData,
                    },
                    sideEffect: true,
                };
            }
            case "rescheduleBooking": {
                const appointment = await this.appointments.reschedule({ appointmentId: args.bookingId, organizationId: ctx.organizationId, newStartAt: args.newStartAt, newEndAt: args.newEndAt, newStaffId: args.newStaffId, actorType: "AI_TOOL", actorId: ctx.subjectId, idempotencyKey: `ai:${idempotencyKey}` });
                return this.confirmedCard(action, "Booking rescheduled by BookPro", { appointmentId: appointment.id, startAt: appointment.startAt.toISOString(), endAt: appointment.endAt.toISOString(), version: appointment.version });
            }
            case "cancelBooking": {
                const appointment = await this.appointments.cancel(args.bookingId, ctx.organizationId, args.reason, "AI_TOOL", ctx.subjectId);
                return this.confirmedCard(action, "Booking cancelled by BookPro", { appointmentId: appointment.id, status: appointment.status, version: appointment.version });
            }
            case "joinWaitlist": {
                const entry = await this.waitlist.joinWaitlist(ctx.organizationId, { ...args, customerId: ctx.customerId, idempotencyKey: `ai:${idempotencyKey}` }, ctx.subjectId);
                return this.confirmedCard(action, "Waitlist entry created by BookPro", { waitlistEntryId: entry.id, status: entry.status, expiresAt: entry.expiresAt });
            }
            case "leaveWaitlist": {
                const customer = await this.resolveCustomer(ctx);
                const entry = await this.prisma.waitlistEntry.findFirst({
                    where: { id: args.waitlistEntryId, organizationId: ctx.organizationId },
                });
                if (!entry) throw new NotFoundException({ code: "WAITLIST_ENTRY_NOT_FOUND", message: "Waitlist entry not found." });
                if (ctx.actorType === ActorType.CUSTOMER && customer && entry.customerId !== customer.id) {
                    throw new NotFoundException({ code: "WAITLIST_ENTRY_NOT_FOUND", message: "Waitlist entry not found." });
                }
                const updated = await this.prisma.waitlistEntry.update({
                    where: { id: entry.id },
                    data: { status: "CANCELLED" },
                });
                return this.confirmedCard(action, "Waitlist entry cancelled", { waitlistEntryId: updated.id, status: updated.status });
            }
            case "scheduleStaffAppointment": {
                let customerEmail = args.customerEmail;
                if (!customerEmail) {
                    const existing = await this.prisma.customer.findFirst({
                        where: { organizationId: ctx.organizationId, fullName: { contains: args.customerName, mode: "insensitive" } },
                    });
                    if (existing?.email) {
                        customerEmail = existing.email;
                    } else {
                        const cleanName = (args.customerName || "walkin").toLowerCase().replace(/[^a-z0-9]/g, "");
                        customerEmail = `${cleanName || "guest"}_${Date.now().toString().slice(-4)}@walkin.bookpro.internal`;
                    }
                }

                let locationId = args.locationId;
                if (!locationId) {
                    const locations = await this.locations.getLocations(ctx.organizationId);
                    if (locations.length > 0) locationId = locations[0].id;
                }

                const appointment = await this.appointments.createManualAppointment({
                    organizationId: ctx.organizationId,
                    locationId,
                    serviceId: args.serviceId,
                    staffId: args.staffId,
                    startAt: args.startAt,
                    endAt: args.endAt,
                    customerName: args.customerName,
                    customerEmail,
                    customerPhone: args.customerPhone,
                    paymentStatus: args.paymentStatus || "UNPAID",
                    internalNotes: args.internalNotes,
                    overrideReason: args.overrideReason,
                    createdById: ctx.subjectId,
                    idempotencyKey: `ai:${idempotencyKey}`,
                });
                return this.confirmedCard(action, "Staff appointment scheduled successfully", {
                    appointmentId: appointment.id,
                    startAt: appointment.startAt.toISOString(),
                    endAt: appointment.endAt.toISOString(),
                    status: appointment.status,
                });
            }
            case "rescheduleStaffAppointment": {
                let newEndAt = args.newEndAt;
                if (!newEndAt) {
                    const appt = await this.prisma.appointment.findUnique({
                        where: { id: args.appointmentId },
                        include: { service: true },
                    });
                    const durationMin = appt?.service?.durationMin || 30;
                    newEndAt = new Date(new Date(args.newStartAt).getTime() + durationMin * 60 * 1000).toISOString();
                }

                const appointment = await this.appointments.reschedule({
                    appointmentId: args.appointmentId,
                    organizationId: ctx.organizationId,
                    newStartAt: args.newStartAt,
                    newEndAt,
                    newStaffId: args.newStaffId,
                    actorType: "STAFF",
                    actorId: ctx.subjectId,
                    overrideReason: args.reason,
                    idempotencyKey: `ai:${idempotencyKey}`,
                });
                return this.confirmedCard(action, "Staff appointment rescheduled successfully", {
                    appointmentId: appointment.id,
                    startAt: appointment.startAt.toISOString(),
                    endAt: appointment.endAt.toISOString(),
                    status: appointment.status,
                });
            }
            case "cancelStaffAppointment": {
                const appointment = await this.appointments.cancel(
                    args.appointmentId,
                    ctx.organizationId,
                    args.reason,
                    "STAFF",
                    ctx.subjectId
                );
                return this.confirmedCard(action, "Staff appointment cancelled successfully", {
                    appointmentId: appointment.id,
                    status: appointment.status,
                });
            }
            case "createBusinessService": {
                const service = await this.services.createService(ctx.organizationId, {
                    name: args.name,
                    category: args.category,
                    description: args.description,
                    durationMin: args.durationMin,
                    priceCents: args.priceCents,
                    currency: args.currency || "USD",
                    depositType: args.depositType || "NONE",
                    depositValue: args.depositValue || 0,
                    preBufferMin: args.preBufferMin || 0,
                    postBufferMin: args.postBufferMin || 0,
                } as any);
                return this.confirmedCard(action, "Business service created successfully", {
                    serviceId: service.id,
                    name: service.name,
                    priceCents: service.priceCents,
                });
            }
            case "updateBusinessService": {
                const service = await this.services.updateService(ctx.organizationId, args.serviceId, {
                    name: args.name,
                    priceCents: args.priceCents,
                    durationMin: args.durationMin,
                    isActive: args.isActive,
                    description: args.description,
                    depositType: args.depositType,
                    depositValue: args.depositValue,
                } as any);
                return this.confirmedCard(action, "Business service updated successfully", {
                    serviceId: service.id,
                    name: service.name,
                    isActive: service.isActive,
                });
            }
            case "updateStaffStatus": {
                const staff = await this.staff.updateStaffMember(ctx.organizationId, args.staffId, {
                    isActive: args.isActive,
                    bookingVisible: args.bookingVisible,
                    title: args.title,
                });
                return this.confirmedCard(action, "Staff status updated successfully", {
                    staffId: staff.id,
                    displayName: staff.displayName,
                    isActive: staff.isActive,
                    bookingVisible: staff.bookingVisible,
                });
            }
            case "issueManualWaitlistOffer": {
                if (!this.waitlistOffers) {
                    throw new BadRequestException({ code: "WAITLIST_OFFER_UNAVAILABLE", message: "Waitlist offer service is unavailable." });
                }
                const offer = await this.waitlistOffers.createManualOffer(
                    ctx.organizationId,
                    {
                        waitlistEntryId: args.waitlistEntryId,
                        startAt: args.slotStartAt,
                        endAt: args.slotEndAt,
                        staffId: args.staffId,
                        expiresInMinutes: args.expiryMinutes,
                    },
                    ctx.subjectId
                );
                return this.confirmedCard(action, "Waitlist offer issued and dispatched", {
                    offerId: offer.id,
                    status: offer.status,
                    expiresAt: offer.expiresAt,
                });
            }
            case "createDiscountCoupon": {
                if (!this.marketing) {
                    throw new BadRequestException({ code: "MARKETING_UNAVAILABLE", message: "Marketing service is unavailable." });
                }
                const coupon = await this.marketing.createCoupon(
                    {
                        code: args.code,
                        discountType: args.discountType,
                        discountValue: args.discountValue,
                        validTo: args.validUntil,
                        usageLimit: args.usageLimit,
                    } as any,
                    {
                        organizationId: ctx.organizationId,
                        subjectId: ctx.subjectId,
                        actorType: ctx.actorType,
                        permissions: ctx.permissions,
                        correlationId: ctx.correlationId,
                    } as any
                );
                return this.confirmedCard(action, "Discount coupon created successfully", {
                    couponId: coupon.id,
                    code: coupon.code,
                    discountValue: coupon.discountValue,
                });
            }
            case "updateBusinessPolicy": {
                const policy = await this.policies.updatePolicyConfig(ctx.organizationId, {
                    minNoticeHours: args.minNoticeHours,
                    cancelCutoffHours: args.cancelCutoffHours,
                    cancelFeeType: args.cancelFeeType,
                    cancelFeeValue: args.cancelFeeValue,
                    rescheduleCutoffHours: args.rescheduleCutoffHours,
                    holdDurationMinutes: args.holdDurationMinutes,
                });
                return this.confirmedCard(action, "Business policy configuration updated", {
                    policyId: policy.id,
                });
            }
            default:
                throw new BadRequestException({ code: "AI_ACTION_NOT_EXECUTABLE", message: "This proposal cannot be executed." });
        }
    }

    private async revalidateProposal(action: string, authoritative: any, args: any, ctx: TrustedAIContext): Promise<void> {
        if (action === "createBookingHold") {
            const slot = await this.availability.validateAvailability({ organizationId: ctx.organizationId, locationId: args.locationId, serviceId: args.serviceId, staffId: args.staffId, startTime: args.startAt, partySize: args.partySize });
            const quote = await this.pricing.calculateQuote(ctx.organizationId, { serviceId: args.serviceId, staffId: args.staffId, locationId: args.locationId });
            if (!slot.isAvailable || slot.endTime !== args.endAt || quote.quoteVersion !== authoritative.price.quoteVersion) throw new ConflictException({ code: "AI_PROPOSAL_STALE", message: "Availability or pricing changed. Review a fresh proposal." });
        } else if (["rescheduleBooking", "cancelBooking"].includes(action)) {
            const booking = await this.getAuthorizedBooking(args.bookingId, ctx, action === "cancelBooking" ? PermissionKey.APPOINTMENT_CANCEL : PermissionKey.APPOINTMENT_MUTATE);
            if (booking.version !== authoritative.bookingVersion) throw new ConflictException({ code: "AI_PROPOSAL_STALE", message: "The booking changed after this proposal was created." });
            if (action === "rescheduleBooking") {
                const quote = await this.pricing.calculateQuote(ctx.organizationId, { serviceId: booking.serviceId, staffId: args.newStaffId || booking.staffId || undefined, locationId: booking.locationId });
                if (quote.quoteVersion !== authoritative.quoteVersion || quote.totalCents - booking.priceCents !== 0) throw new ConflictException({ code: "AI_PROPOSAL_STALE", message: "The reschedule's commercial implications changed. Continue through the normal BookPro flow." });
            }
            if (action === "cancelBooking") {
                const quote = await this.policies.getCancellationQuote(ctx.organizationId, booking.id);
                if (quote.feeCents !== authoritative.feeCents || quote.refundableCents !== authoritative.refundableCents) throw new ConflictException({ code: "AI_PROPOSAL_STALE", message: "Cancellation terms changed. Review a fresh quote." });
            }
        } else if (action === "confirmBooking") {
            const hold = await this.holds.getHold(args.holdId, ctx.organizationId);
            await this.assertCustomerOwnership(hold.customerId, ctx);
            this.assertLocationScope(ctx, hold.locationId);
            if (hold.status !== "ACTIVE" || hold.expiresAt <= new Date()) throw new ConflictException({ code: "HOLD_EXPIRED", message: "The booking hold expired." });
        } else if (action === "joinWaitlist") {
            await this.services.getServiceById(ctx.organizationId, args.serviceId);
        } else if (action === "leaveWaitlist") {
            const entry = await this.prisma.waitlistEntry.findFirst({
                where: { id: args.waitlistEntryId, organizationId: ctx.organizationId },
            });
            if (!entry || entry.status !== "ACTIVE") {
                throw new ConflictException({ code: "AI_PROPOSAL_STALE", message: "The waitlist entry is no longer active." });
            }
        } else if (action === "scheduleStaffAppointment") {
            const service = await this.services.getServiceById(ctx.organizationId, args.serviceId);
            if (!service || !service.isActive) {
                throw new ConflictException({ code: "AI_PROPOSAL_STALE", message: "The service is no longer active." });
            }
        } else if (["rescheduleStaffAppointment", "cancelStaffAppointment"].includes(action)) {
            const appt = await this.getAuthorizedBooking(args.appointmentId, ctx, action === "cancelStaffAppointment" ? PermissionKey.APPOINTMENT_CANCEL : PermissionKey.APPOINTMENT_MUTATE);
            if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appt.status)) {
                throw new ConflictException({ code: "AI_PROPOSAL_STALE", message: "The appointment is already in a terminal state." });
            }
        } else if (action === "updateStaffStatus") {
            await this.staff.getStaffById(ctx.organizationId, args.staffId);
        } else if (action === "issueManualWaitlistOffer") {
            const entry = await this.prisma.waitlistEntry.findFirst({
                where: { id: args.waitlistEntryId, organizationId: ctx.organizationId },
            });
            if (!entry || entry.status !== "ACTIVE") {
                throw new ConflictException({ code: "AI_PROPOSAL_STALE", message: "The waitlist entry is no longer active." });
            }
        } else if (action === "createDiscountCoupon") {
            const existing = await this.prisma.coupon.findFirst({
                where: { organizationId: ctx.organizationId, code: args.code.trim().toUpperCase() },
            });
            if (existing) {
                throw new ConflictException({ code: "AI_PROPOSAL_STALE", message: "A coupon with this code already exists." });
            }
        }
    }

    private assertRoleToolAccess(toolName: AIToolName, ctx: TrustedAIContext): void {
        const customerAllowedTools: AIToolName[] = [
            "getLocations",
            "getServices",
            "getServiceDetails",
            "findAvailability",
            "getBooking",
            "createBookingHold",
            "releaseBookingHold",
            "confirmBooking",
            "getMyUpcomingAppointments",
            "getMyAccountSummary",
            "getMyBookingHolds",
            "getMyWaitlistStatus",
            "getMyBillingHistory",
            "getOrganizationInfo",
            "getOrganizationPolicies",
            "rescheduleBooking",
            "autoRescheduleAppointment",
            "cancelBooking",
            "joinWaitlist",
            "leaveWaitlist",
            "getBusinessPolicies",
        ];

        const customerExclusiveTools: AIToolName[] = [
            "createBookingHold",
            "confirmBooking",
            "releaseBookingHold",
            "getMyUpcomingAppointments",
            "getMyAccountSummary",
            "getMyBookingHolds",
            "getMyWaitlistStatus",
            "getMyBillingHistory",
            "rescheduleBooking",
            "autoRescheduleAppointment",
            "cancelBooking",
            "joinWaitlist",
            "leaveWaitlist",
        ];

        if (ctx.actorType === ActorType.CUSTOMER) {
            if (!customerAllowedTools.includes(toolName)) {
                throw new ForbiddenException({
                    code: "CROSS_ROLE_TOOL_DENIED",
                    message: "Customer accounts cannot access enterprise owner tools or operational business data.",
                });
            }
        } else if (ctx.actorType === ActorType.STAFF) {
            if (customerExclusiveTools.includes(toolName)) {
                throw new ForbiddenException({
                    code: "CROSS_ROLE_TOOL_DENIED",
                    message: "Staff and owners cannot execute customer self-service checkout tools. Use authoritative staff appointment workflows instead.",
                });
            }
        }
    }

    private async getAuthorizedBooking(id: string, ctx: TrustedAIContext, permission: PermissionKey): Promise<any> {
        const booking = await this.appointments.getAppointmentDetail(id, ctx.organizationId);
        if (ctx.actorType === ActorType.CUSTOMER) await this.assertCustomerOwnership(booking.customerId, ctx);
        else this.requirePermission(ctx, permission);
        this.assertLocationScope(ctx, booking.locationId);
        return booking;
    }

    private async resolveCustomer(ctx: TrustedAIContext): Promise<any> {
        if (!this.prisma?.customer) return null;
        if (ctx.customerId) {
            const customer = await this.prisma.customer.findFirst({
                where: { id: ctx.customerId, organizationId: ctx.organizationId },
            });
            if (customer) return customer;
        }
        if (ctx.subjectId) {
            const customerByUserId = await this.prisma.customer.findFirst({
                where: { userId: ctx.subjectId, organizationId: ctx.organizationId },
            });
            if (customerByUserId) return customerByUserId;

            if (this.prisma.user) {
                const user = await this.prisma.user.findUnique({
                    where: { id: ctx.subjectId },
                    select: { email: true },
                });
                if (user?.email) {
                    return this.prisma.customer.findFirst({
                        where: {
                            organizationId: ctx.organizationId,
                            email: { equals: user.email.toLowerCase(), mode: "insensitive" },
                        },
                    });
                }
            }
        }
        return null;
    }

    private async assertCustomerOwnership(resourceCustomerId: string | null, ctx: TrustedAIContext): Promise<void> {
        if (ctx.actorType !== ActorType.CUSTOMER) return;
        if (ctx.customerId) {
            if (resourceCustomerId !== ctx.customerId) {
                throw new NotFoundException({ code: "BOOKING_NOT_FOUND", message: "Booking not found." });
            }
            return;
        }
        const customer = await this.resolveCustomer(ctx);
        if (!customer || customer.id !== resourceCustomerId) {
            throw new NotFoundException({ code: "BOOKING_NOT_FOUND", message: "Booking not found." });
        }
    }

    private requirePermissionOrCustomer(ctx: TrustedAIContext, permission: PermissionKey): void {
        if (ctx.actorType !== ActorType.CUSTOMER) this.requirePermission(ctx, permission);
    }

    private requirePermission(ctx: TrustedAIContext, permission: PermissionKey): void {
        if (!ctx.permissions.includes(permission)) throw new ForbiddenException({ code: "FORBIDDEN_PERMISSION", message: "The delegated actor is not allowed to perform this action." });
    }

    private assertLocationScope(ctx: TrustedAIContext, locationId: string): void {
        if (ctx.locationIds?.length && !ctx.locationIds.includes(locationId)) throw new ForbiddenException({ code: "LOCATION_SCOPE_FORBIDDEN", message: "The location is outside the delegated scope." });
    }

    private async proposalCard(conversationId: string, actionType: string, executionArgs: any, ctx: TrustedAIContext, authoritativeData: any, requestedExpiry?: Date): Promise<AIToolResult> {
        const expiresAt = new Date(Math.min(requestedExpiry?.getTime() || Infinity, Date.now() + 10 * 60_000));
        const proposalId = randomUUID();
        const tokenPayload = `${proposalId}.${ctx.participantId}.${expiresAt.getTime()}`;
        const signature = createHmac("sha256", this.proposalSecret).update(tokenPayload).digest("base64url");
        const confirmationToken = `${tokenPayload}.${signature}`;
        await this.prisma.aIActionProposal.create({
            data: { id: proposalId, organizationId: ctx.organizationId, conversationId, participantId: ctx.participantId, actionType, authoritativeData: this.sanitize(authoritativeData), executionArgs: this.sanitize(executionArgs), confirmationHash: createHash("sha256").update(confirmationToken).digest("hex"), expiresAt },
        });
        const result = { proposalId, actionType, authoritativeData, expiresAt: expiresAt.toISOString(), requiresExplicitConfirmation: true };
        return { result, card: { kind: "CONFIRMATION", toolName: actionType, title: "Review and explicitly confirm", data: authoritativeData, proposalId, confirmationToken, expiresAt: expiresAt.toISOString() }, sideEffect: true };
    }

    private verifyConfirmationToken(token: string, storedHash: string): boolean {
        if (!this.proposalSecret || token.length > 256) return false;
        const parts = token.split(".");
        if (parts.length !== 4) return false;
        const [proposalId, participantId, expires, signature] = parts;
        if (Number(expires) <= Date.now()) return false;
        const expectedSignature = createHmac("sha256", this.proposalSecret).update(`${proposalId}.${participantId}.${expires}`).digest("base64url");
        const sigA = Buffer.from(signature);
        const sigB = Buffer.from(expectedSignature);
        const suppliedHash = createHash("sha256").update(token).digest("hex");
        return sigA.length === sigB.length && timingSafeEqual(sigA, sigB) && suppliedHash === storedHash;
    }

    private infoCard(toolName: string, title: string, data: Record<string, unknown>): AIToolResult {
        return { result: data, card: { kind: "TOOL_RESULT", toolName, title, data }, sideEffect: false };
    }

    private customCard(kind: any, toolName: string, title: string, data: Record<string, unknown>): AIToolResult {
        return { result: data, card: { kind, toolName, title, data }, sideEffect: false };
    }

    private confirmedCard(toolName: string, title: string, data: Record<string, unknown>): AIToolResult {
        return { result: data, card: { kind: "CANONICAL_REFETCH", toolName, title, data }, sideEffect: true };
    }

    private bookingProjection(booking: any): Record<string, unknown> {
        return {
            id: booking.id,
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            serviceName: booking.service?.name,
            durationMin: booking.service?.durationMin,
            staffDisplayName: booking.staff?.displayName || null,
            locationName: booking.location?.name,
            locationAddress: [booking.location?.address, booking.location?.city].filter(Boolean).join(", ") || null,
            startAt: booking.startAt.toISOString(),
            endAt: booking.endAt.toISOString(),
            partySize: booking.partySize,
            priceCents: booking.priceCents,
            currency: booking.currency,
        };
    }

    private sanitize(value: any): any {
        if (Array.isArray(value)) return value.slice(0, 100).map((item) => this.sanitize(item));
        if (value && typeof value === "object") {
            return Object.fromEntries(
                Object.entries(value)
                    .filter(([key]) => !/(secret|token|password|internalNotes|operationalNotes|clientSecret|stripeAccountId|secretEncrypted|codeHash|pendingSecret|databaseUrl|querySignature|quoteSignature)/i.test(key))
                    .map(([key, child]) => [key, this.sanitize(child)])
            );
        }
        if (typeof value === "string") return value.slice(0, 4000);
        return value;
    }

    private errorCode(error: any): string {
        return error?.response?.code || error?.response?.error?.code || error?.code || "AI_TOOL_FAILED";
    }

    private uuidOrNull(value: string): string | null {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
    }
}
