import { Controller, Get, Post, Put, Delete, Body, Param, Query, ForbiddenException } from "@nestjs/common";
import { ReqContext, RequirePermissions } from "@bookpro/server-core";
import { PermissionKey, RequestContext } from "@bookpro/contracts";
import { CommissionsService } from "./commissions.service";
import { createCommissionRuleSchema, updateCommissionStatusSchema } from "@bookpro/validation";

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
        @Body() body: any,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        const name = body?.name || "Default Rule";
        const calculationType = (body?.calculationType || body?.type || "PERCENTAGE") as any;
        const rateValue = typeof body?.rateValue === "number" ? body.rateValue : typeof body?.rate === "number" ? body.rate : 1000;
        const calculationBasis = (body?.calculationBasis || "NET_SERVICE_PRICE") as any;
        const staffId = body?.staffId || null;
        return this.commissionsService.createCommissionRule(orgId, {
            name,
            calculationType,
            rateValue,
            calculationBasis,
            staffId,
        });
    }

    @RequirePermissions(PermissionKey.PAYMENT_MANAGE)
    @Put("rules/:id")
    async updateRule(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @Body() body: any,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        const dto: any = {};
        if (body?.name !== undefined) dto.name = body.name;
        if (body?.rateValue !== undefined) dto.rateValue = body.rateValue;
        else if (body?.rate !== undefined) dto.rateValue = body.rate;
        if (body?.calculationType !== undefined) dto.calculationType = body.calculationType;
        else if (body?.type !== undefined) dto.calculationType = body.type;
        if (body?.calculationBasis !== undefined) dto.calculationBasis = body.calculationBasis;
        if (body?.isActive !== undefined) dto.isActive = body.isActive;
        if (body?.staffId !== undefined) dto.staffId = body.staffId;
        return this.commissionsService.updateCommissionRule(orgId, id, dto);
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
