import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Query,
    Body,
    ForbiddenException,
    BadRequestException,
} from "@nestjs/common";
import { ReqContext, RequirePermissions } from "@bookpro/server-core";
import { RequestContext, PermissionKey, ScheduleInsightStatus } from "@bookpro/contracts";
import {
    scanGapsSchema,
    actionInsightSchema,
    dismissInsightSchema,
    updateOptimizerSettingsSchema,
} from "@bookpro/validation";
import { GapDetectionService } from "./gap-detection.service";
import { ScheduleInsightService } from "./schedule-insight.service";
import { NoShowSignalService } from "./no-show-signal.service";
import { RecoveredRevenueService } from "./recovered-revenue.service";

@Controller("organizations/:orgId/optimizer")
export class OptimizerController {
    constructor(
        private readonly gapDetectionService: GapDetectionService,
        private readonly scheduleInsightService: ScheduleInsightService,
        private readonly noShowSignalService: NoShowSignalService,
        private readonly recoveredRevenueService: RecoveredRevenueService,
    ) {}

    private resolveOrgId(ctx: RequestContext, paramOrgId: string): string {
        const organizationId = ctx.organizationId || paramOrgId;
        if (paramOrgId && ctx.organizationId && !ctx.isPlatformAdmin && ctx.organizationId !== paramOrgId) {
            throw new ForbiddenException("Tenant context mismatch.");
        }
        return organizationId;
    }

    @Get("insights")
    @RequirePermissions(PermissionKey.OPTIMIZER_READ)
    async getInsights(
        @Param("orgId") orgId: string,
        @Query("status") status: ScheduleInsightStatus,
        @Query("locationId") locationId: string,
        @Query("staffId") staffId: string,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        return this.scheduleInsightService.getInsights(organizationId, {
            status,
            locationId,
            staffId,
        });
    }

    @Get("insights/:id")
    @RequirePermissions(PermissionKey.OPTIMIZER_READ)
    async getInsightById(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        return this.scheduleInsightService.getInsightById(organizationId, id);
    }

    @Post("scan")
    @RequirePermissions(PermissionKey.OPTIMIZER_MANAGE)
    async triggerScan(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        const parsed = scanGapsSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        const insights = await this.gapDetectionService.scanAndDetectGaps(organizationId, parsed.data);
        return {
            success: true,
            scannedAt: new Date().toISOString(),
            insightsCount: insights.length,
            insights,
        };
    }

    @Post("insights/:id/action")
    @RequirePermissions(PermissionKey.OPTIMIZER_MANAGE)
    async actionInsight(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        const parsed = actionInsightSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.scheduleInsightService.actionInsight(
            organizationId,
            id,
            parsed.data,
            ctx.membershipId || ctx.subjectId
        );
    }

    @Post("insights/:id/dismiss")
    @RequirePermissions(PermissionKey.OPTIMIZER_MANAGE)
    async dismissInsight(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        const parsed = dismissInsightSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.scheduleInsightService.dismissInsight(
            organizationId,
            id,
            parsed.data,
            ctx.membershipId || ctx.subjectId
        );
    }

    @Get("settings")
    @RequirePermissions(PermissionKey.OPTIMIZER_READ)
    async getSettings(
        @Param("orgId") orgId: string,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        return this.scheduleInsightService.getSettings(organizationId);
    }

    @Patch("settings")
    @RequirePermissions(PermissionKey.OPTIMIZER_MANAGE)
    async updateSettings(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        const parsed = updateOptimizerSettingsSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.scheduleInsightService.updateSettings(organizationId, parsed.data);
    }

    @Get("no-show-risk/:customerId")
    @RequirePermissions(PermissionKey.OPTIMIZER_READ)
    async getCustomerNoShowRisk(
        @Param("orgId") orgId: string,
        @Param("customerId") customerId: string,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        return this.noShowSignalService.calculateCustomerRiskSignal(organizationId, customerId);
    }

    @Get("recovered-revenue")
    @RequirePermissions(PermissionKey.OPTIMIZER_READ)
    async getRecoveredRevenue(
        @Param("orgId") orgId: string,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        return this.recoveredRevenueService.getRecoveredRevenueStats(organizationId);
    }
}
