import { Controller, Get, Put, Post, Body, Param, Query, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ReqContext, Public, RequirePermissions } from '@bookpro/server-core';
import { RequestContext, UpdateOrganizationDto, PermissionKey } from '@bookpro/contracts';
import { onboardingStepSchema, updateOrganizationSchema } from '@bookpro/validation';
import { OrganizationService } from './organization.service';
import { DashboardOverviewService } from './dashboard-overview.service';

@Controller('organization')
export class OrganizationController {
    constructor(
        private readonly organizationService: OrganizationService,
        private readonly dashboardOverviewService: DashboardOverviewService,
    ) { }

    @Public()
    @Get('by-slug/:slug')
    async getBySlug(@Param('slug') slug: string) {
        const data = await this.organizationService.getOrganizationBySlug(slug);
        const serverNow = new Date();
        return {
            success: true,
            data: data
                ? {
                    ...data,
                    serverTime: serverNow.toISOString(),
                    serverTimestampMs: serverNow.getTime(),
                }
                : data,
        };
    }

    @Public()
    @Get('time')
    getServerTime() {
        const serverNow = new Date();
        return {
            success: true,
            data: {
                serverTime: serverNow.toISOString(),
                serverTimestampMs: serverNow.getTime(),
            },
        };
    }

    private getOrgId(ctx: RequestContext): string {
        if (!ctx.organizationId) {
            throw new BadRequestException('Organization context is required');
        }
        return ctx.organizationId;
    }

    @Get('current')
    @RequirePermissions(PermissionKey.ORG_READ)
    async getCurrentOrg(@ReqContext() ctx: RequestContext) {
        const data = await this.organizationService.getOrganization(this.getOrgId(ctx));
        return { success: true, data };
    }

    @Put('current')
    @RequirePermissions(PermissionKey.ORG_UPDATE)
    async updateCurrentOrg(@ReqContext() ctx: RequestContext, @Body() body: UpdateOrganizationDto) {
        const validated = updateOrganizationSchema.parse(body);
        const data = await this.organizationService.updateOrganization(this.getOrgId(ctx), validated);
        return { success: true, data };
    }

    @Get('onboarding/status')
    @RequirePermissions(PermissionKey.ORG_READ)
    async getOnboardingStatus(@ReqContext() ctx: RequestContext) {
        const data = await this.organizationService.getOnboardingStatus(this.getOrgId(ctx));
        return { success: true, data };
    }

    @Post('onboarding/step')
    @RequirePermissions(PermissionKey.ORG_UPDATE)
    @HttpCode(HttpStatus.OK)
    async saveOnboardingStep(@ReqContext() ctx: RequestContext, @Body() body: unknown) {
        const validated = onboardingStepSchema.parse(body);
        const data = await this.organizationService.saveOnboardingProgress(this.getOrgId(ctx), validated);
        return { success: true, data };
    }

    @Post('publish')
    @RequirePermissions(PermissionKey.ORG_UPDATE)
    @HttpCode(HttpStatus.OK)
    async publishOrganization(@ReqContext() ctx: RequestContext) {
        const data = await this.organizationService.publishOrganization(this.getOrgId(ctx));
        return { success: true, data };
    }

    @Get('dashboard')
    @RequirePermissions(PermissionKey.ORG_READ)
    async getDashboard(
        @ReqContext() ctx: RequestContext,
        @Query('locationId') locationId?: string,
        @Query('currency') currency?: string,
    ) {
        const data = await this.dashboardOverviewService.getDashboardOverview(
            this.getOrgId(ctx),
            locationId,
            currency
        );
        return { success: true, data };
    }

    @Get('publish-eligibility')
    @RequirePermissions(PermissionKey.ORG_READ)
    async checkPublishEligibility(@ReqContext() ctx: RequestContext) {
        const data = await this.organizationService.checkPublishEligibility(this.getOrgId(ctx));
        return { success: true, data };
    }
}
