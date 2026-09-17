import {
    Controller,
    Get,
    Param,
    Query,
    ForbiddenException,
    BadRequestException,
} from "@nestjs/common";
import { ReqContext, RequirePermissions } from "@bookpro/server-core";
import { RequestContext, PermissionKey } from "@bookpro/contracts";
import { auditLogQuerySchema } from "@bookpro/validation";
import { AuditLogQueryService } from "./audit-log-query.service";

@Controller("organizations/:orgId/audit-logs")
export class AuditLogController {
    constructor(private readonly auditLogService: AuditLogQueryService) {}

    private resolveOrgId(ctx: RequestContext, paramOrgId: string): string {
        const organizationId = ctx.organizationId || paramOrgId;
        if (paramOrgId && ctx.organizationId && !ctx.isPlatformAdmin && ctx.organizationId !== paramOrgId) {
            throw new ForbiddenException("Tenant context mismatch.");
        }
        return organizationId;
    }

    @Get()
    @RequirePermissions(PermissionKey.AUDIT_READ)
    async listAuditLogs(
        @Param("orgId") orgId: string,
        @Query() query: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);

        const parsed = auditLogQuerySchema.safeParse(query || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.auditLogService.listAuditLogs(organizationId, parsed.data);
    }
}
