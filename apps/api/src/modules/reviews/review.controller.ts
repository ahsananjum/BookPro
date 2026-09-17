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
import { ReqContext, Public, Authenticated, RequirePermissions } from "@bookpro/server-core";
import { RequestContext, PermissionKey } from "@bookpro/contracts";
import {
    createReviewSchema,
    updateReviewSchema,
    reviewListQuerySchema,
} from "@bookpro/validation";
import { ReviewService } from "./review.service";

@Controller("organizations/:orgId/reviews")
export class ReviewController {
    constructor(private readonly reviewService: ReviewService) {}

    private resolveOrgId(ctx: RequestContext, paramOrgId: string): string {
        const organizationId = ctx.organizationId || paramOrgId;
        if (paramOrgId && ctx.organizationId && !ctx.isPlatformAdmin && ctx.organizationId !== paramOrgId) {
            throw new ForbiddenException("Tenant context mismatch.");
        }
        return organizationId;
    }

    @Post()
    @Authenticated()
    async createReview(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);

        const customerId = ctx.customerId || ctx.subjectId;
        if (!customerId) {
            throw new ForbiddenException("Customer identity required to post a review.");
        }

        const parsed = createReviewSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.reviewService.createReview(organizationId, customerId, parsed.data);
    }

    @Public()
    @Get()
    async listReviews(
        @Param("orgId") orgId: string,
        @Query() query: unknown
    ) {
        const parsed = reviewListQuerySchema.safeParse(query || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.reviewService.listReviews(orgId, parsed.data);
    }

    @Patch(":id")
    @Authenticated()
    async updateReview(
        @Param("orgId") orgId: string,
        @Param("id") id: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);

        const parsed = updateReviewSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        const isManager = ctx.permissions?.includes(PermissionKey.REVIEWS_MANAGE);
        const customerId = isManager ? undefined : ctx.customerId || ctx.subjectId;

        return this.reviewService.updateReview(organizationId, id, parsed.data, customerId);
    }
}
