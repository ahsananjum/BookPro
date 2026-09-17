import { Controller, Get, Put, Body, Query, Param, Headers, BadRequestException, NotFoundException } from '@nestjs/common';
import { ReqContext, RequirePermissions } from '@bookpro/server-core';
import { RequestContext, UpdatePolicyConfigDto, PermissionKey, ActorType, RoleCode } from '@bookpro/contracts';
import { updatePolicyConfigSchema } from '@bookpro/validation';
import { PolicyService } from './policy.service';
import { PrismaService } from '../database/prisma.service';

@Controller()
export class PolicyController {
    constructor(
        private readonly policyService: PolicyService,
        private readonly prisma: PrismaService,
    ) { }

    private async resolveOrgId(
        ctx?: RequestContext,
        orgIdParam?: string,
        queryOrgId?: string,
        headerOrgId?: string,
        headerTenantSlug?: string,
        appointmentId?: string,
    ): Promise<string> {
        let organizationId = orgIdParam || queryOrgId || headerOrgId;
        if (!organizationId && headerTenantSlug) {
            const org = await this.prisma.organization.findUnique({
                where: { slug: headerTenantSlug },
                select: { id: true },
            });
            if (org) organizationId = org.id;
        }
        if (!organizationId && appointmentId) {
            const appt = await this.prisma.appointment.findUnique({
                where: { id: appointmentId },
                select: { organizationId: true },
            });
            if (appt) organizationId = appt.organizationId;
        }
        if (!organizationId) {
            organizationId = ctx?.organizationId;
        }
        if (!organizationId) throw new BadRequestException('Organization context or x-tenant-slug is required');
        if ((orgIdParam || queryOrgId) && ctx?.organizationId && !ctx.isPlatformAdmin && (orgIdParam || queryOrgId) !== ctx.organizationId) {
            throw new BadRequestException('Organization context mismatch');
        }
        return organizationId;
    }

    private async assertOwnedAppointment(appointmentId: string, organizationId: string, ctx?: RequestContext) {
        if (!ctx || (ctx.actorType !== ActorType.CUSTOMER && ctx.roleCode !== RoleCode.STAFF)) return;
        const appointment = await this.prisma.appointment.findFirst({
            where: { id: appointmentId, organizationId },
            include: { customer: true, staff: true },
        });
        if (!appointment) throw new NotFoundException('Appointment not found');

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

    @Get('policies')
    @RequirePermissions(PermissionKey.ORG_READ)
    async getPolicies(
        @ReqContext() ctx: RequestContext,
        @Query('organizationId') queryOrgId?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
    ) {
        const orgId = await this.resolveOrgId(ctx, undefined, queryOrgId, headerOrgId, headerTenantSlug);
        const data = await this.policyService.getPolicies(orgId);
        return { success: true, data };
    }

    @Get('organizations/:orgId/policies/cancellation-quote')
    @RequirePermissions(PermissionKey.APPOINTMENT_READ)
    async calculateCancellationQuoteForOrg(
        @Param('orgId') orgId: string,
        @Query('appointmentId') appointmentId: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        if (!appointmentId) {
            throw new BadRequestException('appointmentId query parameter is required');
        }
        const resolvedOrgId = await this.resolveOrgId(ctx, orgId, undefined, headerOrgId, headerTenantSlug, appointmentId);
        await this.assertOwnedAppointment(appointmentId, resolvedOrgId, ctx);
        return this.policyService.calculateCancellationQuote(resolvedOrgId, appointmentId);
    }

    @Get('policies/cancellation-quote')
    @RequirePermissions(PermissionKey.APPOINTMENT_READ)
    async calculateCancellationQuote(
        @Query('appointmentId') appointmentId: string,
        @Query('organizationId') queryOrgId?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        if (!appointmentId) {
            throw new BadRequestException('appointmentId query parameter is required');
        }
        const resolvedOrgId = await this.resolveOrgId(ctx, undefined, queryOrgId, headerOrgId, headerTenantSlug, appointmentId);
        await this.assertOwnedAppointment(appointmentId, resolvedOrgId, ctx);
        return this.policyService.calculateCancellationQuote(resolvedOrgId, appointmentId);
    }

    @Put('policies')
    @RequirePermissions(PermissionKey.ORG_UPDATE)
    async updatePolicyConfig(
        @ReqContext() ctx: RequestContext,
        @Body() body: UpdatePolicyConfigDto,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
    ) {
        const validated = updatePolicyConfigSchema.parse(body);
        const orgId = await this.resolveOrgId(ctx, undefined, undefined, headerOrgId, headerTenantSlug);
        const data = await this.policyService.updatePolicyConfig(orgId, validated);
        return { success: true, data };
    }

    @Get('policies/resolve')
    @RequirePermissions(PermissionKey.SERVICE_READ)
    async resolvePolicy(
        @ReqContext() ctx: RequestContext,
        @Query('locationId') locationId?: string,
        @Query('serviceId') serviceId?: string,
        @Query('organizationId') queryOrgId?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') headerTenantSlug?: string,
    ) {
        const orgId = await this.resolveOrgId(ctx, undefined, queryOrgId, headerOrgId, headerTenantSlug);
        const data = await this.policyService.resolvePolicy(orgId, locationId, serviceId);
        return { success: true, data };
    }
}
