import { Controller, Get, Post, Put, Delete, Body, Param, Query, Headers, BadRequestException } from '@nestjs/common';
import { ReqContext, RequirePermissions, Public } from '@bookpro/server-core';
import { RequestContext, CreateStaffDto, UpdateStaffDto, SetStaffAvailabilityDto, CreateStaffLeaveDto, PermissionKey } from '@bookpro/contracts';
import { createStaffSchema, updateStaffSchema, setStaffAvailabilitySchema, createStaffLeaveSchema } from '@bookpro/validation';
import { StaffService } from './staff.service';
import { OrganizationService } from '../organization/organization.service';

@Controller('staff')
export class StaffController {
    constructor(
        private readonly staffService: StaffService,
        private readonly organizations: OrganizationService,
    ) { }

    private async resolveOrgId(
        ctx?: RequestContext,
        headerOrgId?: string,
        queryOrgId?: string,
        slug?: string,
        tenantSlug?: string,
    ): Promise<string> {
        let id = ctx?.organizationId || headerOrgId || queryOrgId;
        const targetSlug = slug || tenantSlug;
        if (!id && targetSlug) {
            id = await this.organizations.resolvePublishedOrganizationId(targetSlug).catch(() => undefined);
        }
        if (!id) {
            throw new BadRequestException('Organization context or x-tenant-slug is required');
        }
        return id;
    }

    @Public()
    @Get()
    async getStaffMembers(
        @Query('organizationId') queryOrgId?: string,
        @Query('slug') slug?: string,
        @Query('locationId') locationId?: string,
        @Query('serviceId') serviceId?: string,
        @Query('activeOnly') activeOnly?: string,
        @Query('bookingVisibleOnly') bookingVisibleOnly?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const orgId = await this.resolveOrgId(ctx, headerOrgId, queryOrgId, slug, tenantSlug);
        const data = await this.staffService.getStaffMembers(orgId, {
            locationId,
            serviceId,
            activeOnly: activeOnly === 'true' || activeOnly === '1',
            bookingVisibleOnly: bookingVisibleOnly === 'true' || bookingVisibleOnly === '1',
        });
        return { success: true, data };
    }

    @Public()
    @Get(':id')
    async getStaffById(
        @Param('id') id: string,
        @Query('organizationId') queryOrgId?: string,
        @Query('slug') slug?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const orgId = await this.resolveOrgId(ctx, headerOrgId, queryOrgId, slug, tenantSlug);
        const data = await this.staffService.getStaffById(orgId, id);
        return { success: true, data };
    }

    @Post()
    @RequirePermissions(PermissionKey.STAFF_MANAGE)
    async createStaffMember(
        @ReqContext() ctx: RequestContext,
        @Body() body: CreateStaffDto,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const validated = createStaffSchema.parse(body);
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.staffService.createStaffMember(orgId, validated);
        return { success: true, data };
    }

    @Put(':id')
    @RequirePermissions(PermissionKey.STAFF_MANAGE)
    async updateStaffMember(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Body() body: UpdateStaffDto,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const validated = updateStaffSchema.parse(body);
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.staffService.updateStaffMember(orgId, id, validated);
        return { success: true, data };
    }

    @Put(':id/availability')
    @RequirePermissions(PermissionKey.STAFF_MANAGE)
    async setStaffAvailability(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Body() body: SetStaffAvailabilityDto,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const validated = setStaffAvailabilitySchema.parse(body);
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.staffService.setStaffAvailability(orgId, id, validated);
        return { success: true, data };
    }

    @Post(':id/leave')
    @RequirePermissions(PermissionKey.STAFF_MANAGE)
    async addStaffLeave(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Body() body: CreateStaffLeaveDto,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const validated = createStaffLeaveSchema.parse(body);
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.staffService.createStaffLeave(orgId, id, validated, ctx?.subjectId);
        return { success: true, data };
    }

    @Delete(':id/leave/:leaveId')
    @RequirePermissions(PermissionKey.STAFF_MANAGE)
    async deleteStaffLeave(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Param('leaveId') leaveId: string,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.staffService.deleteStaffLeave(orgId, id, leaveId);
        return { success: true, data };
    }

    @Delete(':id')
    @RequirePermissions(PermissionKey.STAFF_MANAGE)
    async archiveStaff(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.staffService.archiveStaff(orgId, id);
        return { success: true, data };
    }
}
