import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionKey } from "@bookpro/contracts";
import { PERMISSIONS_KEY, IS_PUBLIC_KEY, IS_AUTHENTICATED_KEY } from "./decorators";
import { RequestWithContext } from "./request-context.middleware";

@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        // 1. Explicit Public bypass
        const isPublic = this.reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest<RequestWithContext>();
        const reqContext = request?.context;

        // 2. Request context must exist for any protected route
        if (!reqContext || !reqContext.subjectId || reqContext.subjectId === "anonymous") {
            throw new ForbiddenException({
                code: "UNAUTHORIZED",
                message: "No authenticated request context found",
            });
        }

        // 3. Platform Admins have superuser access across all protected endpoints
        if (reqContext.isPlatformAdmin) {
            return true;
        }

        // 4. Centralized Cross-Tenant Verification: If a route, query, or body target organization is specified,
        // it must match the authenticated session's organizationId
        const targetOrgId =
            request.params?.orgId ||
            request.params?.organizationId ||
            (typeof request.query?.orgId === "string" ? request.query.orgId : undefined) ||
            (typeof request.query?.organizationId === "string" ? request.query.organizationId : undefined) ||
            (request.body && typeof request.body.orgId === "string" ? request.body.orgId : undefined) ||
            (request.body && typeof request.body.organizationId === "string" ? request.body.organizationId : undefined);

        if (targetOrgId && reqContext.organizationId && targetOrgId !== reqContext.organizationId) {
            throw new ForbiddenException({
                code: "CROSS_TENANT_ACCESS_DENIED",
                message: `Cross-tenant access denied: target organization '${targetOrgId}' does not match authenticated organization '${reqContext.organizationId}'`,
            });
        }

        // 5. Check for explicit required permissions
        const requiredPermissions = this.reflector?.getAllAndOverride<PermissionKey[]>(
            PERMISSIONS_KEY,
            [context.getHandler(), context.getClass()]
        );

        if (requiredPermissions && requiredPermissions.length > 0) {
            const hasAllPermissions = requiredPermissions.every((perm) =>
                reqContext.permissions?.includes(perm)
            );

            if (!hasAllPermissions) {
                throw new ForbiddenException({
                    code: "FORBIDDEN_PERMISSION",
                    message: `Missing required permissions: ${requiredPermissions.join(", ")}`,
                });
            }

            return true;
        }

        // 6. Check for explicit authenticated-only classification
        const isAuthenticated = this.reflector?.getAllAndOverride<boolean>(IS_AUTHENTICATED_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isAuthenticated) {
            return true;
        }

        // 7. STRICT DENY-BY-DEFAULT: Route lacks classification metadata
        throw new ForbiddenException({
            code: "UNCLASSIFIED_ROUTE_DENIED",
            message: "Route authorization denied: endpoint lacks explicit classification metadata (@Public, @Authenticated, or @RequirePermissions)",
        });
    }
}
