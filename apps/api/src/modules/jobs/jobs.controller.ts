import { Controller, Get, Post, Param, UnauthorizedException } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { RequirePermissions, ReqContext } from "@bookpro/server-core";
import { PermissionKey, RequestContext } from "@bookpro/contracts";

@Controller("jobs")
export class JobsController {
    constructor(private readonly jobsService: JobsService) { }

    private resolveOrgId(ctx?: RequestContext): string {
        if (!ctx?.organizationId) throw new UnauthorizedException("An active organization is required.");
        return ctx.organizationId;
    }

    @RequirePermissions(PermissionKey.ORG_READ)
    @Get("failed")
    async getFailedJobs(
        @ReqContext() ctx?: RequestContext,
    ) {
        const orgId = this.resolveOrgId(ctx);
        const data = await this.jobsService.getFailedJobs(orgId);
        return { success: true, data };
    }

    @RequirePermissions(PermissionKey.ORG_UPDATE)
    @Post("outbox/:id/retry")
    async retryOutboxJob(
        @Param("id") id: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const orgId = this.resolveOrgId(ctx);
        const data = await this.jobsService.retryOutboxJob(orgId, id);
        return { success: true, data };
    }

    @RequirePermissions(PermissionKey.ORG_UPDATE)
    @Post("notifications/:id/retry")
    async retryNotification(
        @Param("id") id: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const orgId = this.resolveOrgId(ctx);
        const data = await this.jobsService.retryNotification(orgId, id);
        return { success: true, data };
    }
}
