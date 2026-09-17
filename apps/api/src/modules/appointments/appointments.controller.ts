import {
    Controller,
    Post,
    Get,
    Patch,
    Body,
    Param,
    Query,
    Headers,
} from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { ReqContext, Public, RequirePermissions } from '@bookpro/server-core';
import { ActorType, RequestContext, PermissionKey, RoleCode } from '@bookpro/contracts';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrganizationService } from '../organization/organization.service';
import { AppointmentStatus } from '@prisma/client';

import { cancelAppointmentSchema, manualAppointmentSchema, organizationContextBodySchema, publicFinalizeBookingSchema, publicBookingStatusQuerySchema, rescheduleAppointmentSchema } from '@bookpro/validation';

import { PrismaService } from '../database/prisma.service';

@Controller('appointments')
export class AppointmentsController {
    constructor(
        private readonly appointmentService: AppointmentService,
        private readonly organizations: OrganizationService,
        private readonly prisma: PrismaService,
    ) { }

    private async resolveOrgId(
        ctx?: RequestContext,
        headerOrgId?: string,
        queryOrgId?: string,
        bodyOrgId?: string,
        tenantSlug?: string,
        querySlug?: string,
    ): Promise<string> {
        let organizationId = headerOrgId || queryOrgId || bodyOrgId;
        const targetSlug = tenantSlug || querySlug;
        if (!organizationId && targetSlug) {
            try {
                organizationId = await this.organizations.resolvePublishedOrganizationId(targetSlug);
            } catch {
                const org = await this.prisma.organization.findFirst({
                    where: { slug: targetSlug.toLowerCase(), archivedAt: null },
                    select: { id: true },
                });
                if (org) organizationId = org.id;
            }
        }
        if (!organizationId) {
            organizationId = ctx?.organizationId;
        }
        if (!organizationId) throw new BadRequestException('Organization context or x-tenant-slug is required');
        return organizationId;
    }

    private async assertOwnedAppointment(id: string, organizationId: string, ctx?: RequestContext) {
        if (!ctx || (ctx.actorType !== ActorType.CUSTOMER && ctx.roleCode !== RoleCode.STAFF)) return;
        const appointment: any = await this.appointmentService.getAppointmentDetail(id, organizationId);
        let allowed = false;
        if (ctx.actorType === ActorType.CUSTOMER) {
            if (ctx.customerId && appointment.customerId === ctx.customerId) {
                allowed = true;
            } else {
                const user = await this.prisma.user.findUnique({
                    where: { id: ctx.subjectId },
                    select: { id: true, email: true },
                });
                if (user && (appointment.customer?.userId === user.id || appointment.customer?.email?.toLowerCase() === user.email.toLowerCase())) {
                    allowed = true;
                }
            }
        } else {
            allowed = !!ctx.membershipId && appointment.staff?.membershipId === ctx.membershipId;
        }
        if (!allowed) throw new NotFoundException('Appointment not found');
    }

    @RequirePermissions(PermissionKey.APPOINTMENT_CREATE)
    @Post()
    async createAppointment(
        @Body() body: unknown,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @Headers('x-idempotency-key') idempotencyKey?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const organizationId = await this.resolveOrgId(ctx, headerOrgId, undefined, undefined, headerTenantSlug);

        const parsed = manualAppointmentSchema.parse(body);
        return this.appointmentService.createManualAppointment({
            ...parsed,
            organizationId,
            idempotencyKey: idempotencyKey || parsed.idempotencyKey,
            createdById: ctx?.subjectId || 'SYSTEM',
        });
    }

    @Public()
    @Post(['public', 'public/finalize'])
    async createPublicAppointment(
        @Body() body: unknown,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-idempotency-key') idempotencyKey?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        let organizationId = (body as any)?.organizationId || headerOrgId;
        if (!organizationId && tenantSlug) {
            try {
                organizationId = await this.organizations.resolvePublishedOrganizationId(tenantSlug);
            } catch {
                const org = await this.prisma.organization.findFirst({
                    where: { slug: tenantSlug.toLowerCase(), archivedAt: null },
                    select: { id: true },
                });
                if (org) organizationId = org.id;
            }
        }
        if (!organizationId && (body as any)?.bookingHoldId) {
            const hold = await this.prisma.bookingHold.findUnique({
                where: { id: (body as any).bookingHoldId },
                select: { organizationId: true },
            });
            if (hold) organizationId = hold.organizationId;
        }
        if (!organizationId) {
            organizationId = ctx?.organizationId;
        }
        if (!organizationId) {
            throw new BadRequestException('Organization context is required to finalize booking');
        }

        if (ctx?.actorType === ActorType.CUSTOMER) {
            if (!ctx.customerId || !ctx.organizationId || ctx.organizationId !== organizationId) {
                throw new ForbiddenException({
                    code: 'CUSTOMER_ORGANIZATION_REQUIRED',
                    message: 'Select a joined organization from your customer portal before confirming this booking.',
                });
            }
        }

        // Strict validation: rejects client customerId, paymentStatus, price, and status authority
        const parsed = publicFinalizeBookingSchema.parse(body);

        // Derive customer identity strictly from verified server auth context if logged in as customer
        const customerId = ctx?.actorType === ActorType.CUSTOMER && ctx?.customerId ? ctx.customerId : null;

        return this.appointmentService.convertHoldToAppointment({
            organizationId,
            bookingHoldId: parsed.bookingHoldId,
            customerId,
            idempotencyKey: idempotencyKey || parsed.idempotencyKey,
            intakeResponses: parsed.intakeResponses,
            isPublicFinalize: true,
        });
    }

    @Public()
    @Get('public/status')
    async getPublicBookingStatus(
        @Query('holdId') holdId: string,
        @Query('guestToken') guestToken?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = publicBookingStatusQuerySchema.parse({ holdId, guestToken });
        let organizationId = tenantSlug
            ? await this.organizations.resolvePublishedOrganizationId(tenantSlug).catch(() => null)
            : (headerOrgId || ctx?.organizationId);

        if (!organizationId && parsed.holdId) {
            const hold = await this.prisma.bookingHold.findUnique({
                where: { id: parsed.holdId },
                select: { organizationId: true },
            });
            if (hold) organizationId = hold.organizationId;
        }

        if (!organizationId) {
            throw new BadRequestException('Organization context or x-tenant-slug is required');
        }

        return this.appointmentService.getPublicBookingStatus(parsed.holdId, organizationId, parsed.guestToken);
    }

    @Public()
    @Get('public/:id/calendar.ics')
    async getPublicAppointmentIcs(
        @Param('id') id: string,
        @Query('guestToken') guestToken?: string,
        @Query('tenantSlug') queryTenantSlug?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const targetSlug = tenantSlug || queryTenantSlug;
        let organizationId = headerOrgId || ctx?.organizationId;
        if (!organizationId && targetSlug) {
            try {
                organizationId = await this.organizations.resolvePublishedOrganizationId(targetSlug);
            } catch {
                const org = await this.prisma.organization.findFirst({
                    where: { slug: targetSlug.toLowerCase(), archivedAt: null },
                    select: { id: true },
                });
                if (org) organizationId = org.id;
            }
        }
        if (!organizationId) {
            const appt = await this.prisma.appointment.findUnique({
                where: { id },
                select: { organizationId: true },
            });
            if (appt) organizationId = appt.organizationId;
        }
        if (!organizationId) {
            throw new BadRequestException('Organization context is required');
        }

        return this.appointmentService.generateIcsCalendar(
            id,
            organizationId,
            guestToken,
            ctx?.customerId,
        );
    }

    @RequirePermissions(PermissionKey.APPOINTMENT_READ)
    @Get()
    async getAppointments(
        @Query('organizationId') queryOrgId?: string,
        @Query('tenant') queryTenant?: string,
        @Query('tenantSlug') queryTenantSlug?: string,
        @Query('locationId') locationId?: string,
        @Query('staffId') staffId?: string,
        @Query('customerId') customerId?: string,
        @Query('serviceId') serviceId?: string,
        @Query('status') status?: AppointmentStatus,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const organizationId = await this.resolveOrgId(ctx, headerOrgId, queryOrgId, undefined, headerTenantSlug, queryTenant || queryTenantSlug);

        let customerIdFilter: string | undefined = customerId;
        if (ctx?.actorType === ActorType.CUSTOMER) {
            const user = await this.prisma.user.findUnique({
                where: { id: ctx.subjectId },
                select: { id: true, email: true },
            });
            if (user) {
                const customerRecord = await this.prisma.customer.findFirst({
                    where: {
                        organizationId,
                        OR: [
                            { userId: user.id },
                            { email: { equals: user.email.toLowerCase(), mode: 'insensitive' } },
                        ],
                    },
                });
                if (customerRecord) {
                    if (!customerRecord.userId) {
                        await this.prisma.customer.update({
                            where: { id: customerRecord.id },
                            data: { userId: user.id },
                        }).catch(() => null);
                    }
                    customerIdFilter = customerRecord.id;
                } else {
                    return [];
                }
            } else {
                return [];
            }
        }

        return this.appointmentService.getAppointments({
            organizationId,
            locationId,
            staffId: ctx?.roleCode === RoleCode.STAFF ? undefined : staffId,
            membershipId: ctx?.roleCode === RoleCode.STAFF ? ctx.membershipId : undefined,
            customerId: customerIdFilter,
            locationIds: ctx?.locationIds,
            serviceId,
            status,
            startDate,
            endDate,
        });
    }

    @RequirePermissions(PermissionKey.APPOINTMENT_READ)
    @Get(':id')
    async getAppointment(
        @Param('id') id: string,
        @Query('organizationId') queryOrgId?: string,
        @Query('tenantSlug') queryTenantSlug?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const organizationId = await this.resolveOrgId(ctx, headerOrgId, queryOrgId, undefined, headerTenantSlug, queryTenantSlug);
        await this.assertOwnedAppointment(id, organizationId, ctx);
        return this.appointmentService.getAppointmentDetail(id, organizationId);
    }

    @RequirePermissions(PermissionKey.APPOINTMENT_MUTATE)
    @Patch(':id/reschedule')
    async reschedule(
        @Param('id') id: string,
        @Body() body: unknown,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = rescheduleAppointmentSchema.parse(body);
        const organizationId = await this.resolveOrgId(ctx, headerOrgId, undefined, parsed.organizationId, headerTenantSlug);
        await this.assertOwnedAppointment(id, organizationId, ctx);
        return this.appointmentService.reschedule({
            appointmentId: id,
            organizationId,
            newStartAt: parsed.newStartAt,
            newEndAt: parsed.newEndAt,
            newStaffId: parsed.newStaffId,
            overrideReason: parsed.overrideReason,
            actorType: ctx?.actorType === ActorType.CUSTOMER ? 'CUSTOMER' : (ctx?.subjectId ? 'STAFF' : 'CUSTOMER'),
            actorId: ctx?.subjectId || 'SYSTEM',
        });
    }

    @RequirePermissions(PermissionKey.APPOINTMENT_MUTATE)
    @Post(':id/reschedule/propose')
    async proposeReschedule(
        @Param('id') id: string,
        @Body() body: unknown,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = rescheduleAppointmentSchema.parse(body);
        const organizationId = await this.resolveOrgId(ctx, headerOrgId, undefined, parsed.organizationId, headerTenantSlug);
        await this.assertOwnedAppointment(id, organizationId, ctx);
        return this.appointmentService.proposeReschedule({
            appointmentId: id,
            organizationId,
            newStartAt: parsed.newStartAt,
            newEndAt: parsed.newEndAt,
            newStaffId: parsed.newStaffId,
            reason: parsed.overrideReason,
            proposedById: ctx?.subjectId || 'STAFF',
        });
    }

    @Public()
    @Post(':id/reschedule/confirm')
    async confirmReschedule(
        @Param('id') id: string,
        @Body() body: unknown,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = organizationContextBodySchema.parse(body || {});
        const organizationId = await this.resolveOrgId(ctx, headerOrgId, undefined, parsed.organizationId, headerTenantSlug);
        return this.appointmentService.confirmRescheduleProposal(id, organizationId, ctx?.subjectId || 'CUSTOMER');
    }

    @Public()
    @Post(':id/reschedule/decline')
    async declineReschedule(
        @Param('id') id: string,
        @Body() body: unknown,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = organizationContextBodySchema.parse(body || {});
        const organizationId = await this.resolveOrgId(ctx, headerOrgId, undefined, parsed.organizationId, headerTenantSlug);
        return this.appointmentService.declineRescheduleProposal(id, organizationId, ctx?.subjectId || 'CUSTOMER');
    }

    @RequirePermissions(PermissionKey.APPOINTMENT_CANCEL)
    @Post(':id/cancel')
    async cancel(
        @Param('id') id: string,
        @Body() body: unknown,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        try {
            const parsed = cancelAppointmentSchema.parse(body);
            const organizationId = await this.resolveOrgId(ctx, headerOrgId, undefined, parsed.organizationId, headerTenantSlug);
            await this.assertOwnedAppointment(id, organizationId, ctx);
            return await this.appointmentService.cancel(
                id,
                organizationId,
                parsed.reason,
                ctx?.actorType === ActorType.CUSTOMER ? 'CUSTOMER' : (ctx?.subjectId ? 'STAFF' : 'CUSTOMER'),
                ctx?.subjectId || 'SYSTEM',
                parsed.quoteVersion,
            );
        } catch (err: any) {
            console.error('=== APPOINTMENT CANCEL CONTROLLER ERROR ===');
            console.error(err);
            console.error(err.stack);
            throw err;
        }
    }

    @RequirePermissions(PermissionKey.APPOINTMENT_MUTATE)
    @Post(':id/check-in')
    async checkIn() {
        throw new BadRequestException(
            "Manual check-in is disabled. Check-in must be performed by scanning the client's cryptographic QR pass within the check-in window [startAt - 60m to startAt + 5m]."
        );
    }

    @RequirePermissions(PermissionKey.APPOINTMENT_MUTATE)
    @Post(':id/start')
    async start(
        @Param('id') id: string,
        @Body() body: unknown,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = organizationContextBodySchema.parse(body || {});
        const organizationId = await this.resolveOrgId(ctx, headerOrgId, undefined, parsed.organizationId, headerTenantSlug);
        await this.assertOwnedAppointment(id, organizationId, ctx);
        return this.appointmentService.transitionStatus(
            id,
            organizationId,
            'IN_PROGRESS',
            'STAFF',
            ctx?.subjectId || 'SYSTEM',
        );
    }

    @RequirePermissions(PermissionKey.APPOINTMENT_MUTATE)
    @Post(':id/complete')
    async complete(
        @Param('id') id: string,
        @Body() body: unknown,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = organizationContextBodySchema.parse(body || {});
        const organizationId = await this.resolveOrgId(ctx, headerOrgId, undefined, parsed.organizationId, headerTenantSlug);
        await this.assertOwnedAppointment(id, organizationId, ctx);
        return this.appointmentService.transitionStatus(
            id,
            organizationId,
            'COMPLETED',
            'STAFF',
            ctx?.subjectId || 'SYSTEM',
        );
    }

    @RequirePermissions(PermissionKey.APPOINTMENT_MUTATE)
    @Post(':id/no-show')
    async markNoShow(
        @Param('id') id: string,
        @Body() body: unknown,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = organizationContextBodySchema.parse(body || {});
        const organizationId = await this.resolveOrgId(ctx, headerOrgId, undefined, parsed.organizationId, headerTenantSlug);
        await this.assertOwnedAppointment(id, organizationId, ctx);
        return this.appointmentService.transitionStatus(
            id,
            organizationId,
            'NO_SHOW',
            'STAFF',
            ctx?.subjectId || 'SYSTEM',
        );
    }

    @RequirePermissions(PermissionKey.APPOINTMENT_MUTATE)
    @Post('auto-settle')
    async autoSettle(
        @Body() body: unknown,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = organizationContextBodySchema.parse(body || {});
        const organizationId = await this.resolveOrgId(ctx, headerOrgId, undefined, parsed.organizationId, headerTenantSlug);
        return this.appointmentService.autoSettleEndedAppointments(organizationId);
    }
}
