import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Put, Query } from "@nestjs/common";
import { Authenticated, Public, ReqContext, RequirePermissions } from "@bookpro/server-core";
import { PermissionKey, RequestContext } from "@bookpro/contracts";
import {
  acceptCustomerInviteSchema,
  customerMarketingPreferenceSchema,
  inviteCustomerSchema,
  joinOrganizationSchema,
  organizationDirectorySchema,
  previewCustomerInviteSchema,
} from "@bookpro/validation";
import { CustomerPortalService } from "./customer-portal.service";

@Controller("customer-portal")
export class CustomerPortalController {
  constructor(private readonly service: CustomerPortalService) {}

  @Public()
  @Get("organizations")
  listOrganizations(@Query() query: unknown) {
    return this.service.listOrganizations(organizationDirectorySchema.parse(query));
  }

  @Public()
  @Post("invitations/preview")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  preview(@Body() body: unknown) {
    return this.service.previewInvitation(previewCustomerInviteSchema.parse(body));
  }

  @Authenticated()
  @Post("join")
  @HttpCode(HttpStatus.CREATED)
  join(@Body() body: unknown, @ReqContext() ctx: RequestContext) {
    return this.service.join(joinOrganizationSchema.parse(body), ctx);
  }

  @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
  @Post("invitations")
  invite(@Body() body: unknown, @ReqContext() ctx: RequestContext) {
    return this.service.invite(inviteCustomerSchema.parse(body), ctx);
  }

  @RequirePermissions(PermissionKey.CUSTOMER_READ)
  @Get("invitations")
  invitations(@ReqContext() ctx: RequestContext) {
    return this.service.listInvitations(ctx);
  }

  @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
  @Post("invitations/:id/revoke")
  revoke(@Param("id") id: string, @ReqContext() ctx: RequestContext) {
    return this.service.revokeInvitation(id, ctx);
  }

  @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
  @Post("invitations/:id/resend")
  resend(@Param("id") id: string, @ReqContext() ctx: RequestContext) {
    return this.service.resendInvitation(id, ctx);
  }

  @Authenticated()
  @Post("invitations/accept")
  accept(@Body() body: unknown, @ReqContext() ctx: RequestContext) {
    return this.service.acceptInvite(acceptCustomerInviteSchema.parse(body), ctx);
  }

  // ==========================================
  // OFFERS & DEALS
  // ==========================================

  @Authenticated()
  @Get("offers")
  offers(@ReqContext() ctx: RequestContext) {
    return this.service.getOffers(ctx);
  }

  @Public()
  @Get("organizations/:slugOrId/offers")
  publicOffers(@Param("slugOrId") slugOrId: string) {
    return this.service.getPublicOffers(slugOrId);
  }

  // ==========================================
  // MARKETING PREFERENCES
  // ==========================================

  @Authenticated()
  @Get("preferences")
  preferences(@ReqContext() ctx: RequestContext) {
    return this.service.getMarketingPreferences(ctx);
  }

  @Authenticated()
  @Put("preferences")
  updatePreferences(@Body() body: unknown, @ReqContext() ctx: RequestContext) {
    return this.service.updateMarketingPreferences(
      customerMarketingPreferenceSchema.parse(body),
      ctx
    );
  }

  // ==========================================
  // BILLING & RECEIPTS
  // ==========================================

  @Authenticated()
  @Get("billing")
  billing(@ReqContext() ctx: RequestContext) {
    return this.service.getCustomerBilling(ctx);
  }
}
