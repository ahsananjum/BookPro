import { Controller, Get, Post, Put, Delete, Body, Param, Query, Headers, BadRequestException } from '@nestjs/common';
import { ReqContext, RequirePermissions, Public } from '@bookpro/server-core';
import { RequestContext, CreateLocationDto, UpdateLocationDto, PermissionKey } from '@bookpro/contracts';
import { createLocationSchema, updateLocationSchema, createLocationHolidaySchema } from '@bookpro/validation';
import { LocationService } from './location.service';
import { OrganizationService } from '../organization/organization.service';

@Controller('locations')
export class LocationController {
    constructor(
        private readonly locationService: LocationService,
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
    async getLocations(
        @Query('organizationId') queryOrgId?: string,
        @Query('slug') slug?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const orgId = await this.resolveOrgId(ctx, headerOrgId, queryOrgId, slug, tenantSlug);
        const data = await this.locationService.getLocations(orgId);
        return { success: true, data };
    }

    @Public()
    @Get(':id')
    async getLocationById(
        @Param('id') id: string,
        @Query('organizationId') queryOrgId?: string,
        @Query('slug') slug?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const orgId = await this.resolveOrgId(ctx, headerOrgId, queryOrgId, slug, tenantSlug);
        const data = await this.locationService.getLocationById(orgId, id);
        return { success: true, data };
    }

    @Post()
    @RequirePermissions(PermissionKey.LOCATION_MANAGE)
    async createLocation(
        @ReqContext() ctx: RequestContext,
        @Body() body: CreateLocationDto,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const validated = createLocationSchema.parse(body);
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.locationService.createLocation(orgId, validated);
        return { success: true, data };
    }

    @Put(':id')
    @RequirePermissions(PermissionKey.LOCATION_MANAGE)
    async updateLocation(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Body() body: UpdateLocationDto,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const validated = updateLocationSchema.parse(body);
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.locationService.updateLocation(orgId, id, validated);
        return { success: true, data };
    }

    @Delete(':id')
    @RequirePermissions(PermissionKey.LOCATION_MANAGE)
    async archiveLocation(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.locationService.archiveLocation(orgId, id);
        return { success: true, data };
    }

    @Public()
    @Get(':id/holidays')
    async getLocationHolidays(
        @Param('id') id: string,
        @Query('organizationId') queryOrgId?: string,
        @Query('slug') slug?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const orgId = await this.resolveOrgId(ctx, headerOrgId, queryOrgId, slug, tenantSlug);
        const data = await this.locationService.getLocationHolidays(orgId, id);
        return { success: true, data };
    }

    @Post(':id/holidays')
    @RequirePermissions(PermissionKey.LOCATION_MANAGE)
    async addLocationHoliday(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Body() body: any,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const validated = createLocationHolidaySchema.parse(body);
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.locationService.addLocationHoliday(orgId, id, validated);
        return { success: true, data };
    }

    @Delete(':id/holidays/:holidayId')
    @RequirePermissions(PermissionKey.LOCATION_MANAGE)
    async deleteLocationHoliday(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Param('holidayId') holidayId: string,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.locationService.deleteLocationHoliday(orgId, id, holidayId);
        return { success: true, data };
    }
}
