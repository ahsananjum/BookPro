import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import { PermissionKey, RequestContext } from "@bookpro/contracts";
import { RequestWithContext } from "./request-context.middleware";

export const PERMISSIONS_KEY = "permissions";
export const IS_PUBLIC_KEY = "isPublic";
export const IS_AUTHENTICATED_KEY = "isAuthenticated";

/**
 * Parameter decorator to extract RequestContext from HTTP request
 */
export const ReqContext = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): RequestContext => {
        const request = ctx.switchToHttp().getRequest<RequestWithContext>();
        if (!request.context) {
            throw new Error("RequestContext missing from request. Ensure RequestContextMiddleware is applied.");
        }
        return request.context;
    }
);

/**
 * Decorator to enforce required permission capabilities on endpoint handlers
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
    SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Decorator to mark endpoints as public (bypasses auth and permissions guard)
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Decorator to mark endpoints as requiring a valid authenticated session without specific permissions
 */
export const Authenticated = () => SetMetadata(IS_AUTHENTICATED_KEY, true);

