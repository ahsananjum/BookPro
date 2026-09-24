import { Controller, Get, Post, Put, Delete, Body, Param, Query, ForbiddenException } from "@nestjs/common";
import { ReqContext, RequirePermissions } from "@bookpro/server-core";
import { PermissionKey, RequestContext } from "@bookpro/contracts";
import { CommissionsService } from "./commissions.service";
import { createCommissionRuleSchema, updateCommissionRuleSchema, updateCommissionStatusSchema } from "@bookpro/validation";

@Controller("organizations/:orgId/commissions")
export class CommissionsController {
    constructor(private readonly commissionsService: CommissionsService) { }

    private assertTenant(ctx: RequestContext, orgId: string) {
        if (ctx.organizationId !== orgId) throw new ForbiddenException("Commission data not found");
    }

    @RequirePermissions(PermissionKey.PAYMENT_READ)
    @Get()
    async listLedger(
        @Param("orgId") orgId: string,
        @Query("staffId") staffId?: string,
        @Query("status") status?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        const entries = await this.commissionsService.listCommissionLedger(orgId, { staffId, status });
        return {
            entries,
            records: entries,
            items: entries,
            total: entries.length,
        };
    }

    @RequirePermissions(PermissionKey.PAYMENT_READ)
    @Get("summary")
    async getSummary(
        @Param("orgId") orgId: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        return this.commissionsService.getCommissionSummary(orgId);
    }

    @RequirePermissions(PermissionKey.PAYMENT_READ)
    @Get("rules")
    async listRules(
        @Param("orgId") orgId: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        return this.commissionsService.listCommissionRules(orgId);
    }

    @RequirePermissions(PermissionKey.PAYMENT_MANAGE)
    @Post("rules")
    async createRule(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        const validated = createCommissionRuleSchema.parse(body);
        return this.commissionsService.createCommissionRule(orgId, {
            name: validated.name,
            calculationType: validated.calculationType as any,
            rateValue: validated.rateValue,
            calculationBasis: validated.calculationBasis as any,
            staffId: validated.staffId || undefined,
        });
    }

    @RequirePermissions(PermissionKey.PAYMENT_MANAGE)
    @Put("rules/:id")
    async updateRule(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @Body() body: unknown,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        const validated = updateCommissionRuleSchema.parse(body);
        return this.commissionsService.updateCommissionRule(orgId, id, {
            ...validated,
            calculationType: validated.calculationType as any,
            calculationBasis: validated.calculationBasis as any,
        });
    }

    @RequirePermissions(PermissionKey.PAYMENT_MANAGE)
    @Delete("rules/:id")
    async deleteRule(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        return this.commissionsService.deleteCommissionRule(orgId, id);
    }

    @RequirePermissions(PermissionKey.PAYMENT_MANAGE)
    @Post("calculate/:appointmentId")
    async calculateForAppointment(@Param("orgId") orgId: string, @Param("appointmentId") appointmentId: string, @ReqContext() ctx: RequestContext) {
        this.assertTenant(ctx, orgId);
        return this.commissionsService.calculateCommissionForAppointment(appointmentId);
    }

    @RequirePermissions(PermissionKey.PAYMENT_MANAGE)
    @Put(":id/status")
    async updateStatus(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @Body() body: unknown,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        const parsed = updateCommissionStatusSchema.parse(body);
        return this.commissionsService.updateCommissionStatus(orgId, id, parsed.status);
    }
}
