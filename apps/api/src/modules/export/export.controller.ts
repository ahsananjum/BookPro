import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Res,
    ForbiddenException,
    BadRequestException,
} from "@nestjs/common";
import { Response } from "express";
import { ReqContext, RequirePermissions } from "@bookpro/server-core";
import { RequestContext, PermissionKey } from "@bookpro/contracts";
import { createExportSchema } from "@bookpro/validation";
import { DataExportService } from "./data-export.service";

@Controller("organizations/:orgId/exports")
export class ExportController {
    constructor(private readonly exportService: DataExportService) {}

    private resolveOrgId(ctx: RequestContext, paramOrgId: string): string {
        const organizationId = ctx.organizationId || paramOrgId;
        if (paramOrgId && ctx.organizationId && !ctx.isPlatformAdmin && ctx.organizationId !== paramOrgId) {
            throw new ForbiddenException("Tenant context mismatch.");
        }
        return organizationId;
    }

    @Post()
    @RequirePermissions(PermissionKey.EXPORT_MANAGE)
    async createExport(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        const parsed = createExportSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.exportService.createExport(organizationId, ctx.subjectId, parsed.data);
    }

    @Get()
    @RequirePermissions(PermissionKey.EXPORT_MANAGE)
    async listExports(
        @Param("orgId") orgId: string,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        return this.exportService.listExports(organizationId);
    }

    @Get(":id/download")
    @RequirePermissions(PermissionKey.EXPORT_MANAGE)
    async downloadExport(
        @Param("orgId") orgId: string,
        @Param("id") exportId: string,
        @ReqContext() ctx: RequestContext,
        @Res() res: Response
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);
        const csv = await this.exportService.getExportCsv(organizationId, exportId);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=bookpro_${exportId}.csv`);
        res.send(csv);
    }
}
