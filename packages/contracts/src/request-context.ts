import { ActorType, PermissionKey, RoleCode } from "./permissions";

export interface RequestContext {
    requestId: string;
    correlationId: string;
    actorType: ActorType;
    subjectId: string;
    organizationId?: string;
    membershipId?: string;
    customerId?: string;
    sessionId?: string;
    roleCode?: RoleCode;
    permissions: PermissionKey[];
    locationIds?: string[];
    locale: string;
    timezone: string;
    isPlatformAdmin: boolean;
    ipAddress?: string;
    userAgent?: string;
    issuedAt: string;
}

export const RequestHeaders = {
    REQUEST_ID: "x-request-id",
    CORRELATION_ID: "x-correlation-id",
    ORGANIZATION_ID: "x-organization-id",
    AUTHORIZATION: "authorization",
} as const;
