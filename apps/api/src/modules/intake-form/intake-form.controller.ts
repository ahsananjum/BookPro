import { Controller, Get, Post, Put, Delete, Body, Param, Query, Headers, BadRequestException } from '@nestjs/common';
import { ReqContext, Public, RequirePermissions } from '@bookpro/server-core';
import { RequestContext, CreateIntakeFormDto, UpdateIntakeFormDto, PermissionKey } from '@bookpro/contracts';
import { createIntakeFormSchema, updateIntakeFormSchema } from '@bookpro/validation';
import { IntakeFormService } from './intake-form.service';
import { OrganizationService } from '../organization/organization.service';

@Controller('intake-forms')
export class IntakeFormController {
    constructor(
        private readonly intakeFormService: IntakeFormService,
        private readonly organizations: OrganizationService,
    ) { }

    private resolveOrgId(ctx?: RequestContext, headerOrgId?: string, queryOrgId?: string): string {
        const id = ctx?.organizationId || headerOrgId || queryOrgId;
        if (!id) {
            throw new BadRequestException('Organization context is required');
        }
        return id;
    }

    @Public()
    @Get()
    async getIntakeForms(
        @Query('organizationId') queryOrgId?: string,
        @Query('serviceId') serviceId?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        let orgId = queryOrgId || headerOrgId || ctx?.organizationId;
        if (!orgId && tenantSlug) {
            orgId = await this.organizations.resolvePublishedOrganizationId(tenantSlug).catch(() => undefined);
        }
        if (!orgId) {
            throw new BadRequestException('Organization context or x-tenant-slug is required');
        }
        const data = await this.intakeFormService.getIntakeForms(orgId, serviceId);
        return { success: true, data };
    }

    @Public()
    @Get(':id')
    async getIntakeFormById(
        @Param('id') id: string,
        @Query('organizationId') queryOrgId?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        let orgId = queryOrgId || headerOrgId || ctx?.organizationId;
        if (!orgId && tenantSlug) {
            orgId = await this.organizations.resolvePublishedOrganizationId(tenantSlug).catch(() => undefined);
        }
        if (!orgId) {
            throw new BadRequestException('Organization context or x-tenant-slug is required');
        }
        const data = await this.intakeFormService.getIntakeFormById(orgId, id);
        return { success: true, data };
    }

    @Post()
    @RequirePermissions(PermissionKey.SERVICE_MANAGE)
    async createIntakeForm(@ReqContext() ctx: RequestContext, @Body() body: CreateIntakeFormDto) {
        const validated = createIntakeFormSchema.parse(body);
        const data = await this.intakeFormService.createIntakeForm(this.resolveOrgId(ctx), validated);
        return { success: true, data };
    }

    @Put(':id')
    @RequirePermissions(PermissionKey.SERVICE_MANAGE)
    async updateIntakeForm(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Body() body: UpdateIntakeFormDto,
    ) {
        const validated = updateIntakeFormSchema.parse(body);
        const data = await this.intakeFormService.updateIntakeForm(this.resolveOrgId(ctx), id, validated);
        return { success: true, data };
    }

    @Delete(':id')
    @RequirePermissions(PermissionKey.SERVICE_MANAGE)
    async archiveIntakeForm(@ReqContext() ctx: RequestContext, @Param('id') id: string) {
        const data = await this.intakeFormService.archiveIntakeForm(this.resolveOrgId(ctx), id);
        return { success: true, data };
    }
}
