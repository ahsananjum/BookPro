import {
    Controller,
    Post,
    Get,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    Headers,
    UnauthorizedException,
} from "@nestjs/common";
import { WaitlistEntryService } from "./waitlist-entry.service";
import { WaitlistOfferService } from "./waitlist-offer.service";
import { WaitlistAcceptanceService } from "./waitlist-acceptance.service";
import { ReqContext, Public, Authenticated } from "@bookpro/server-core";
import { RequestContext } from "@bookpro/contracts";
import { OrganizationService } from "../organization/organization.service";
import { acceptOfferSchema, publicJoinWaitlistSchema, updateWaitlistEntrySchema, declineOfferSchema, smartRescheduleWaitlistSchema } from "@bookpro/validation";

@Controller("waitlist")
export class WaitlistCustomerController {
    constructor(
        private readonly entryService: WaitlistEntryService,
        private readonly offerService: WaitlistOfferService,
        private readonly acceptanceService: WaitlistAcceptanceService,
        private readonly organizations: OrganizationService,
    ) { }

    private resolveOrgId(
        ctx?: RequestContext,
    ): string {
        if (!ctx?.organizationId) throw new UnauthorizedException("An active organization is required.");
        return ctx.organizationId;
    }

    /**
     * Customer or guest joins waitlist
     */
    @Public()
    @Post("entries")
    async joinWaitlist(
        @Body() body: unknown,
        @Headers("x-organization-id") headerOrgId?: string,
        @Headers("x-tenant-slug") tenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const organizationId = await this.organizations.resolvePublishedOrganizationId(tenantSlug || "");
        const parsed = publicJoinWaitlistSchema.parse(body);
        return this.entryService.joinWaitlist(organizationId, { ...parsed, organizationId }, undefined);
    }

    /**
     * Authenticated customer gets their active waitlist entries
     */
    @Get("entries/my")
    @Authenticated()
    async getMyEntries(
        @Query("customerId") queryCustomerId?: string,
        @Headers("x-organization-id") headerOrgId?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const organizationId = this.resolveOrgId(ctx);
        const customerId = ctx?.customerId;
        if (!customerId) {
            throw new UnauthorizedException("Customer authentication required.");
        }
        return this.entryService.getCustomerEntries(organizationId, customerId);
    }

    /**
     * Customer updates preferences on active waitlist entry
     */
    @Patch("entries/:id")
    @Authenticated()
    async updatePreferences(
        @Param("id") id: string,
        @Body() body: unknown,
        @Query("customerId") queryCustomerId?: string,
        @Headers("x-organization-id") headerOrgId?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const organizationId = this.resolveOrgId(ctx);
        const customerId = ctx?.customerId || "";
        if (!customerId) throw new UnauthorizedException("Customer authentication required.");
        const parsed = updateWaitlistEntrySchema.parse(body);
        return this.entryService.updatePreferences(organizationId, id, customerId, parsed);
    }

    /**
     * Customer cancels waitlist entry
     */
    @Delete("entries/:id")
    @Authenticated()
    async cancelEntry(
        @Param("id") id: string,
        @Query("customerId") queryCustomerId?: string,
        @Headers("x-organization-id") headerOrgId?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const organizationId = this.resolveOrgId(ctx);
        const customerId = ctx?.customerId;
        if (!customerId) throw new UnauthorizedException("Customer authentication required.");
        return this.entryService.cancelEntry(organizationId, id, customerId);
    }

    /**
     * Public claim preview of an offer by high-entropy token
     */
    @Public()
    @Get("offers/claim")
    async previewOffer(@Query("token") token: string) {
        return this.offerService.getOfferPreviewByToken(token);
    }

    /**
     * Atomic first-wins offer acceptance
     */
    @Public()
    @Post("offers/accept")
    async acceptOffer(
        @Body() body: unknown,
        @Headers("x-idempotency-key") idempotencyKey?: string,
    ) {
        const parsed = acceptOfferSchema.parse(body);
        return this.acceptanceService.acceptOffer({
            ...parsed,
            idempotencyKey: idempotencyKey || parsed.idempotencyKey,
        });
    }

    /**
     * Authenticated customer gets their active pending waitlist offers (Fast-Pass)
     */
     @Get("offers/my")
     @Authenticated()
     async getMyOffers(
         @Headers("x-organization-id") headerOrgId?: string,
         @ReqContext() ctx?: RequestContext,
     ) {
         const organizationId = this.resolveOrgId(ctx);
         const customerId = ctx?.customerId;
         if (!customerId) {
             throw new UnauthorizedException("Customer authentication required.");
         }
         return this.offerService.getCustomerActiveOffers(organizationId, customerId);
     }

     /**
      * Customer declines an offer (revoking hold and cascading to next candidate)
      */
     @Public()
     @Post("offers/decline")
     async declineOffer(@Body() body: unknown) {
         const parsed = declineOfferSchema.parse(body);
         return this.offerService.declineOffer(parsed.token, parsed.reason, parsed.removeFromWaitlist);
     }

     /**
      * Customer requests priority smart rescheduling when target date/time is fully booked
      */
     @Post("entries/smart-reschedule")
     @Authenticated()
     async smartRescheduleWaitlist(
         @Body() body: unknown,
         @Headers("x-organization-id") headerOrgId?: string,
         @ReqContext() ctx?: RequestContext,
     ) {
         const organizationId = this.resolveOrgId(ctx);
         const customerId = ctx?.customerId;
         if (!customerId) throw new UnauthorizedException("Customer authentication required.");
         const parsed = smartRescheduleWaitlistSchema.parse(body);
         return this.entryService.createSmartRescheduleWaitlist(organizationId, customerId, parsed);
     }

     /**
      * Public preview of active waitlist holds (filtered for calendar availability)
      */
     @Public()
     @Get("holds")
     async getHolds(
         @Query("organizationId") queryOrgId?: string,
         @Query("startDate") startDate?: string,
         @Query("endDate") endDate?: string,
         @Headers("x-organization-id") headerOrgId?: string,
         @Headers("x-tenant-slug") tenantSlug?: string,
         @ReqContext() ctx?: RequestContext,
     ) {
         let organizationId = headerOrgId || queryOrgId || ctx?.organizationId;
         if (!organizationId && tenantSlug) {
             organizationId = await this.organizations.resolvePublishedOrganizationId(tenantSlug);
         }
         if (!organizationId) throw new UnauthorizedException("Organization context required.");
         return this.offerService.getWaitlistHoldBlocks(organizationId, startDate, endDate);
     }
}
