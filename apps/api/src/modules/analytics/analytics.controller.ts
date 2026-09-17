import {
    Controller,
    Get,
    Post,
    Param,
    Query,
    Body,
    ForbiddenException,
    BadRequestException,
} from "@nestjs/common";
import { ReqContext, RequirePermissions, Authenticated } from "@bookpro/server-core";
import { RequestContext, PermissionKey } from "@bookpro/contracts";
import {
    analyticsQuerySchema,
    analyticsRebuildSchema,
    createProductAnalyticsEventSchema,
} from "@bookpro/validation";
import { AnalyticsAggregatorService } from "./analytics-aggregator.service";
import { AnalyticsRebuildService } from "./analytics-rebuild.service";
import { ProductAnalyticsService } from "./product-analytics.service";

@Controller("organizations/:orgId/analytics")
export class AnalyticsController {
    constructor(
        private readonly aggregator: AnalyticsAggregatorService,
        private readonly rebuilder: AnalyticsRebuildService,
        private readonly productAnalytics: ProductAnalyticsService
    ) {}

    private resolveOrgId(ctx: RequestContext, paramOrgId: string): string {
        const organizationId = ctx.organizationId || paramOrgId;
        if (paramOrgId && ctx.organizationId && !ctx.isPlatformAdmin && ctx.organizationId !== paramOrgId) {
            throw new ForbiddenException("Tenant context mismatch.");
        }
        return organizationId;
    }

    @Get("overview")
    @RequirePermissions(PermissionKey.ANALYTICS_READ)
    async getDashboardOverview(
        @Param("orgId") orgId: string,
        @Query() query: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        const parsed = analyticsQuerySchema.safeParse(query || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.aggregator.getDashboardOverview(organizationId, parsed.data);
    }

    @Get("metrics")
    @RequirePermissions(PermissionKey.ANALYTICS_READ)
    async getDailyMetrics(
        @Param("orgId") orgId: string,
        @Query() query: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        const parsed = analyticsQuerySchema.safeParse(query || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.aggregator.getDailyMetrics(organizationId, parsed.data);
    }

    @Post("rebuild")
    @RequirePermissions(PermissionKey.ANALYTICS_MANAGE)
    async triggerRebuild(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        const parsed = analyticsRebuildSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.rebuilder.rebuildMetrics(organizationId, parsed.data);
    }

    @Post("events")
    @Authenticated()
    async trackProductEvent(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        const parsed = createProductAnalyticsEventSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.productAnalytics.trackEvent(parsed.data, {
            organizationId,
            actorType: ctx.actorType || "CUSTOMER",
            actorId: ctx.subjectId || undefined,
        });
    }
}
