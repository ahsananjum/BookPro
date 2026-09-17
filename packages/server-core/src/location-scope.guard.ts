import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { RequestWithContext } from "./request-context.middleware";

@Injectable()
export class LocationScopeGuard implements CanActivate {
    private extractLocationIdsFromObject(obj: any, maxDepth = 4, currentDepth = 0): string[] {
        if (!obj || typeof obj !== "object" || currentDepth >= maxDepth) {
            return [];
        }

        const found: string[] = [];

        // Check common location ID property names
        const locationKeys = ["locationId", "locId", "location_id"];
        for (const key of locationKeys) {
            if (typeof obj[key] === "string" && obj[key].trim() !== "") {
                found.push(obj[key].trim());
            }
        }

        // Check array property names
        if (Array.isArray(obj.locationIds)) {
            for (const item of obj.locationIds) {
                if (typeof item === "string" && item.trim() !== "") {
                    found.push(item.trim());
                }
            }
        }

        // Recursively inspect nested object properties
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (val && typeof val === "object") {
                found.push(...this.extractLocationIdsFromObject(val, maxDepth, currentDepth + 1));
            }
        }

        return found;
    }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<RequestWithContext>();
        const reqContext = request?.context;

        if (!reqContext) {
            return true;
        }

        // Platform admins or actors without location restrictions (e.g. owners/all-location managers) bypass
        if (reqContext.isPlatformAdmin || !reqContext.locationIds || reqContext.locationIds.length === 0) {
            return true;
        }

        const targetLocationIds: string[] = [];

        if (request.params) {
            targetLocationIds.push(...this.extractLocationIdsFromObject(request.params));
        }
        if (request.query) {
            targetLocationIds.push(...this.extractLocationIdsFromObject(request.query));
        }
        if (request.body) {
            targetLocationIds.push(...this.extractLocationIdsFromObject(request.body));
        }

        const uniqueTargetLocationIds = Array.from(new Set(targetLocationIds));

        for (const locId of uniqueTargetLocationIds) {
            if (!reqContext.locationIds.includes(locId)) {
                throw new ForbiddenException({
                    code: "LOCATION_SCOPE_DENIED",
                    message: `Access denied to location ${locId}. Actor location scope violation.`,
                });
            }
        }

        return true;
    }
}
