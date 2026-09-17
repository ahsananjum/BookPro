import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    Query,
    Body,
} from "@nestjs/common";
import { WaitlistEntryService } from "./waitlist-entry.service";
import { WaitlistOfferService } from "./waitlist-offer.service";
import { ReqContext, RequirePermissions } from "@bookpro/server-core";
import {
    RequestContext,
    PermissionKey,
    WaitlistEntryStatus,
} from "@bookpro/contracts";
import { createManualOfferSchema, staffJoinWaitlistSchema } from "@bookpro/validation";

@Controller("organizations/:orgId/waitlist")
export class WaitlistStaffController {
    constructor(
        private readonly entryService: WaitlistEntryService,
        private readonly offerService: WaitlistOfferService,
    ) { }

    /**
     * Staff lists waitlist entries with filters & pagination
     */
    @Get("entries")
    @RequirePermissions(PermissionKey.APPOINTMENT_READ)
    async listEntries(
        @Param("orgId") orgId: string,
        @ReqContext() ctx: RequestContext,
        @Query("status") status?: WaitlistEntryStatus,
        @Query("serviceId") serviceId?: string,
        @Query("locationId") locationId?: string,
        @Query("staffId") staffId?: string,
        @Query("search") search?: string,
        @Query("page") page?: string,
        @Query("limit") limit?: string,
    ) {
        const organizationId = ctx.organizationId || orgId;
        return this.entryService.listEntriesForStaff(organizationId, {
            status,
            serviceId,
            locationId,
            staffId,
            search,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
        });
    }

    /**
     * Staff joins a customer to the waitlist
     */
    @Post("entries")
    @RequirePermissions(PermissionKey.APPOINTMENT_CREATE)
    async addEntry(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext,
    ) {
        const organizationId = ctx.organizationId || orgId;
        const parsed = staffJoinWaitlistSchema.parse(body);
        return this.entryService.joinWaitlist(organizationId, parsed, ctx.subjectId);
    }

    /**
     * Staff cancels/removes a waitlist entry
     */
    @Delete("entries/:id")
    @RequirePermissions(PermissionKey.APPOINTMENT_CANCEL)
    async cancelEntry(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @ReqContext() ctx: RequestContext,
    ) {
        const organizationId = ctx.organizationId || orgId;
        return this.entryService.cancelEntry(organizationId, id);
    }

    /**
     * Staff creates a validated manual offer for a waitlist entry
     */
    @Post("offers")
    @RequirePermissions(PermissionKey.APPOINTMENT_CREATE)
    async createOffer(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext,
    ) {
        const organizationId = ctx.organizationId || orgId;
        const parsed = createManualOfferSchema.parse(body);
        return this.offerService.createManualOffer(organizationId, parsed, ctx.subjectId);
    }

    /**
     * Staff revokes a pending offer
     */
    @Post("offers/:id/revoke")
    @RequirePermissions(PermissionKey.APPOINTMENT_CANCEL)
    async revokeOffer(
        @Param("orgId") orgId: string,
        @Param("id") offerId: string,
        @ReqContext() ctx: RequestContext,
    ) {
        const organizationId = ctx.organizationId || orgId;
        return this.offerService.revokeOffer(organizationId, offerId);
    }

    /**
     * Staff lists offers
     */
    @Get("offers")
    @RequirePermissions(PermissionKey.APPOINTMENT_READ)
    async listOffers(
        @Param("orgId") orgId: string,
        @ReqContext() ctx: RequestContext,
        @Query("waitlistEntryId") waitlistEntryId?: string,
    ) {
        const organizationId = ctx.organizationId || orgId;
        return this.offerService.listOffers(organizationId, waitlistEntryId);
    }

    /**
     * Staff lists active waitlist holds (for visual calendar display)
     */
    @Get("holds")
    @RequirePermissions(PermissionKey.APPOINTMENT_READ)
    async getHolds(
        @Param("orgId") orgId: string,
        @ReqContext() ctx: RequestContext,
        @Query("startDate") startDate?: string,
        @Query("endDate") endDate?: string,
    ) {
        const organizationId = ctx.organizationId || orgId;
        return this.offerService.getWaitlistHoldBlocks(organizationId, startDate, endDate);
    }
}
