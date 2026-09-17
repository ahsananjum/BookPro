import {
    Controller,
    Get,
    Post,
    Body,
    ForbiddenException,
    BadRequestException,
} from "@nestjs/common";
import { ReqContext, RequirePermissions } from "@bookpro/server-core";
import { RequestContext, PermissionKey } from "@bookpro/contracts";
import { platformSupportAccessSchema } from "@bookpro/validation";
import { PlatformAdminService } from "./platform-admin.service";

@Controller("platform")
@RequirePermissions(PermissionKey.PLATFORM_ADMIN)
export class PlatformAdminController {
    constructor(private readonly platformService: PlatformAdminService) {}

    private assertPlatformAdmin(ctx: RequestContext) {
        if (!ctx.isPlatformAdmin) {
            throw new ForbiddenException("Platform Admin privileges required.");
        }
    }

    @Get("health")
    async getHealth(@ReqContext() ctx: RequestContext) {
        this.assertPlatformAdmin(ctx);
        return this.platformService.getSystemHealth();
    }

    @Get("tenants")
    async listTenants(@ReqContext() ctx: RequestContext) {
        this.assertPlatformAdmin(ctx);
        return this.platformService.listTenants();
    }

    @Get("failed-jobs")
    async listFailedJobs(@ReqContext() ctx: RequestContext) {
        this.assertPlatformAdmin(ctx);
        return this.platformService.listFailedJobs();
    }

    @Post("support-access")
    async supportAccess(
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        this.assertPlatformAdmin(ctx);

        const parsed = platformSupportAccessSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.platformService.logSupportAccess(
            ctx.subjectId,
            parsed.data.targetTenantId,
            parsed.data.reason
        );
    }
}
