import { Controller, Get, Param, Query, ForbiddenException } from "@nestjs/common";
import { ReqContext, RequirePermissions } from "@bookpro/server-core";
import { RequestContext, PermissionKey } from "@bookpro/contracts";
import { SearchService } from "./search.service";

@Controller("organizations/:orgId/search")
export class SearchController {
    constructor(private readonly searchService: SearchService) {}

    @Get()
    @RequirePermissions(PermissionKey.ORG_READ)
    async search(
        @Param("orgId") orgId: string,
        @Query("q") query: string,
        @Query("locationId") locationId: string | undefined,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = ctx.organizationId || orgId;
        if (orgId && ctx.organizationId && !ctx.isPlatformAdmin && ctx.organizationId !== orgId) {
            throw new ForbiddenException("Tenant context mismatch.");
        }

        return this.searchService.searchAll(organizationId, query, {
            permissions: ctx.permissions,
            locationId,
        });
    }
}
