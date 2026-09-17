import { Controller, Get, Post, Put, Delete, Body, Param, Query, Headers, BadRequestException } from '@nestjs/common';
import { ReqContext, RequirePermissions, Public } from '@bookpro/server-core';
import { RequestContext, CreateServiceDto, UpdateServiceDto, PermissionKey } from '@bookpro/contracts';
import { createServiceSchema, updateServiceSchema } from '@bookpro/validation';
import { ServiceService } from './service.service';
import { OrganizationService } from '../organization/organization.service';

@Controller('services')
export class ServiceController {
    constructor(
        private readonly serviceService: ServiceService,
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
    async getServices(
        @Query('organizationId') queryOrgId?: string,
        @Query('slug') slug?: string,
        @Query('activeOnly') activeOnly?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const orgId = await this.resolveOrgId(ctx, headerOrgId, queryOrgId, slug, tenantSlug);
        const isOwnerContext = Boolean(ctx?.organizationId && ctx.organizationId === orgId);
        const shouldFilterActive = activeOnly !== undefined ? activeOnly === 'true' : !isOwnerContext;
        const data = await this.serviceService.getServices(orgId, shouldFilterActive);
        return { success: true, data };
    }

    @Public()
    @Get(':id')
    async getServiceById(
        @Param('id') id: string,
        @Query('organizationId') queryOrgId?: string,
        @Query('slug') slug?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const orgId = await this.resolveOrgId(ctx, headerOrgId, queryOrgId, slug, tenantSlug);
        const data = await this.serviceService.getServiceById(orgId, id);
        return { success: true, data };
    }

    @Post()
    @RequirePermissions(PermissionKey.SERVICE_MANAGE)
    async createService(
        @ReqContext() ctx: RequestContext,
        @Body() body: CreateServiceDto,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const validated = createServiceSchema.parse(body);
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.serviceService.createService(orgId, validated);
        return { success: true, data };
    }

    @Put(':id')
    @RequirePermissions(PermissionKey.SERVICE_MANAGE)
    async updateService(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Body() body: UpdateServiceDto,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const validated = updateServiceSchema.parse(body);
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.serviceService.updateService(orgId, id, validated);
        return { success: true, data };
    }

    @Delete(':id')
    @RequirePermissions(PermissionKey.SERVICE_MANAGE)
    async archiveService(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Headers('x-organization-id') headerOrgId?: string,
    ) {
        const orgId = ctx.organizationId || headerOrgId;
        if (!orgId) throw new BadRequestException('Organization context is required');
        const data = await this.serviceService.archiveService(orgId, id);
        return { success: true, data };
    }
}
