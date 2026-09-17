import { Controller, Get, Post, Patch, Delete, Put, Body, Param, Query, ForbiddenException } from "@nestjs/common";
import { ReqContext, RequirePermissions } from "@bookpro/server-core";
import { PermissionKey, RequestContext } from "@bookpro/contracts";
import { CrmService } from "./crm.service";
import {
    customerNoteSchema,
    marketingConsentSchema,
    createCustomerSchema,
    updateCustomerSchema,
    manageCustomerTagSchema,
} from "@bookpro/validation";

@Controller("organizations/:orgId/customers")
export class CrmController {
    constructor(private readonly crmService: CrmService) { }

    private assertTenant(ctx: RequestContext, orgId: string) {
        if (ctx.organizationId !== orgId) throw new ForbiddenException("Customer record not found");
    }

    @RequirePermissions(PermissionKey.CUSTOMER_READ)
    @Get()
    async listCustomers(
        @Param("orgId") orgId: string,
        @Query("search") search?: string,
        @Query("tag") tag?: string,
        @Query("accountFilter") accountFilter?: "ALL" | "PORTAL_MEMBER" | "GUEST",
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        return this.crmService.listCustomers(orgId, { search, tag, accountFilter });
    }

    @RequirePermissions(PermissionKey.CUSTOMER_READ)
    @Get(":id")
    async getCustomerDetails(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        return this.crmService.getCustomerDetails(orgId, id, false);
    }

    @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
    @Post()
    async createCustomer(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        const parsed = createCustomerSchema.parse(body);
        return this.crmService.createCustomer(orgId, ctx!.subjectId, parsed);
    }

    @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
    @Patch(":id")
    async updateCustomer(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @Body() body: unknown,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        const parsed = updateCustomerSchema.parse(body);
        return this.crmService.updateCustomer(orgId, id, ctx!.subjectId, parsed);
    }

    @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
    @Delete(":id")
    async deleteCustomer(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        return this.crmService.deleteCustomer(orgId, id, ctx!.subjectId);
    }

    @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
    @Post(":id/invite")
    async inviteCustomer(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        return this.crmService.inviteCustomer(orgId, id, ctx!);
    }

    @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
    @Post(":id/tags")
    async manageCustomerTag(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @Body() body: unknown,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        const parsed = manageCustomerTagSchema.parse(body);
        return this.crmService.manageCustomerTag(orgId, id, ctx!.subjectId, parsed.tag, parsed.action);
    }

    @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
    @Post(":id/notes")
    async addCustomerNote(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @Body() body: unknown,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        const parsed = customerNoteSchema.parse(body);
        return this.crmService.addCustomerNote(
            orgId,
            id,
            ctx!.subjectId,
            parsed.content,
            parsed.isInternal
        );
    }

    @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
    @Put(":id/consent")
    async updateConsent(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @Body() body: unknown,
        @ReqContext() ctx?: RequestContext,
    ) {
        this.assertTenant(ctx!, orgId);
        const parsed = marketingConsentSchema.parse(body);
        return this.crmService.updateMarketingConsent(orgId, id, parsed.consentMarketing, parsed.source);
    }
}
