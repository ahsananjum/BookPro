import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { ReqContext, RequirePermissions } from "@bookpro/server-core";
import { AudienceSegment, PermissionKey, RequestContext } from "@bookpro/contracts";
import {
  audienceQuerySchema,
  createCouponSchema,
  emailTemplateSchema,
  sendCampaignExtendedSchema,
  updateCouponSchema,
} from "@bookpro/validation";
import { MarketingService } from "./marketing.service";

@Controller("marketing")
export class MarketingController {
  constructor(private readonly service: MarketingService) {}

  // ==========================================
  // TELEMETRY & STATS
  // ==========================================

  @Get("stats")
  @RequirePermissions(PermissionKey.CUSTOMER_READ)
  stats(@ReqContext() ctx: RequestContext) {
    return this.service.getOverviewStats(ctx);
  }

  // ==========================================
  // AUDIENCE DIRECTORY
  // ==========================================

  @Get("audience")
  @RequirePermissions(PermissionKey.CUSTOMER_READ)
  audience(@Query() query: unknown, @ReqContext() ctx: RequestContext) {
    const parsed = audienceQuerySchema.parse(query || {});
    return this.service.getAudienceList(ctx, parsed as any);
  }

  @Get("audience/count")
  @RequirePermissions(PermissionKey.CUSTOMER_READ)
  audienceCount(@Query("segment") segment: AudienceSegment | undefined, @ReqContext() ctx: RequestContext) {
    return this.service.getAudienceCount(ctx, segment);
  }

  // ==========================================
  // TEMPLATES
  // ==========================================

  @Get("templates")
  @RequirePermissions(PermissionKey.CUSTOMER_READ)
  list(@ReqContext() ctx: RequestContext) {
    return this.service.list(ctx);
  }

  @Post("templates")
  @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
  create(@Body() body: unknown, @ReqContext() ctx: RequestContext) {
    return this.service.create(emailTemplateSchema.parse(body), ctx);
  }

  @Put("templates/:id")
  @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
  update(@Param("id") id: string, @Body() body: unknown, @ReqContext() ctx: RequestContext) {
    return this.service.update(id, emailTemplateSchema.parse(body), ctx);
  }

  @Post("templates/:id/duplicate")
  @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
  duplicate(@Param("id") id: string, @ReqContext() ctx: RequestContext) {
    return this.service.duplicateTemplate(id, ctx);
  }

  @Delete("templates/:id")
  @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
  remove(@Param("id") id: string, @ReqContext() ctx: RequestContext) {
    return this.service.remove(id, ctx);
  }

  // ==========================================
  // CAMPAIGNS & BROADCASTS
  // ==========================================

  @Get("campaigns")
  @RequirePermissions(PermissionKey.CUSTOMER_READ)
  campaigns(@ReqContext() ctx: RequestContext) {
    return this.service.campaigns(ctx);
  }

  @Get("campaigns/:id")
  @RequirePermissions(PermissionKey.CUSTOMER_READ)
  campaignDetail(@Param("id") id: string, @ReqContext() ctx: RequestContext) {
    return this.service.getCampaignDetail(id, ctx);
  }

  @Post("campaigns/send")
  @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
  send(@Body() body: unknown, @ReqContext() ctx: RequestContext) {
    return this.service.send(sendCampaignExtendedSchema.parse(body) as any, ctx);
  }

  // ==========================================
  // STUDIO COUPONS & OFFERS
  // ==========================================

  @Get("coupons")
  @RequirePermissions(PermissionKey.CUSTOMER_READ)
  listCoupons(@ReqContext() ctx: RequestContext) {
    return this.service.listCoupons(ctx);
  }

  @Post("coupons")
  @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
  createCoupon(@Body() body: unknown, @ReqContext() ctx: RequestContext) {
    return this.service.createCoupon(createCouponSchema.parse(body) as any, ctx);
  }

  @Put("coupons/:id")
  @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
  updateCoupon(@Param("id") id: string, @Body() body: unknown, @ReqContext() ctx: RequestContext) {
    return this.service.updateCoupon(id, updateCouponSchema.parse(body) as any, ctx);
  }

  @Patch("coupons/:id/toggle")
  @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
  toggleCoupon(@Param("id") id: string, @ReqContext() ctx: RequestContext) {
    return this.service.toggleCoupon(id, ctx);
  }

  @Delete("coupons/:id")
  @RequirePermissions(PermissionKey.CUSTOMER_MANAGE)
  deleteCoupon(@Param("id") id: string, @ReqContext() ctx: RequestContext) {
    return this.service.deleteCoupon(id, ctx);
  }
}
