import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RequestWithContext, IS_PUBLIC_KEY } from "@bookpro/server-core";
import { ActorType, RoleCode, PermissionKey } from "@bookpro/contracts";
import { AuthService } from "./auth.service";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly authService: AuthService,
        private readonly prisma: PrismaService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RequestWithContext>();
        const isPublic = this.reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        const authHeader = request.header("authorization");
        const cookieHeader = request.headers.cookie;

        let token: string | undefined;

        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        } else if (cookieHeader) {
            const match = cookieHeader.match(/access_token=([^;]+)/);
            if (match) {
                token = match[1];
            }
        }

        if (!token) {
            if (isPublic) {
                return true;
            }
            throw new UnauthorizedException({
                code: "UNAUTHORIZED",
                message: "Missing authentication token",
            });
        }

        try {
            const payload = await this.authService.validateToken(token);
            await this.authService.validateSession(payload.sid, payload.sub);

            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
                include: {
                    memberships: {
                        include: {
                            organization: true,
                        },
                    },
                    customers: true,
                },
            });

            if (!user || !user.isActive) {
                throw new ForbiddenException({
                    code: "ACCOUNT_DEACTIVATED",
                    message: "User account has been deactivated",
                });
            }

            const headerOrgId = request.header("x-organization-id");
            const headerTenantSlug = request.header("x-tenant-slug");

            let targetOrgId = headerOrgId || payload.organizationId;
            if (!targetOrgId && headerTenantSlug) {
                const org = await this.prisma.organization.findFirst({
                    where: { slug: headerTenantSlug.toLowerCase(), archivedAt: null },
                    select: { id: true },
                });
                if (org) targetOrgId = org.id;
            }

            let activeMembership = targetOrgId
                ? user.memberships.find((m) => m.organizationId === targetOrgId)
                : user.memberships.find((m) => m.status === "ACTIVE") || user.memberships[0];

            if (activeMembership && activeMembership.status !== "ACTIVE") {
                throw new ForbiddenException({
                    code: "MEMBERSHIP_DEACTIVATED",
                    message: "Membership in organization has been deactivated",
                });
            }

            let activeCustomer: any = targetOrgId
                ? user.customers.find((c) => c.organizationId === targetOrgId)
                : user.customers[0];

            if (!activeCustomer && targetOrgId) {
                activeCustomer = await this.prisma.customer.findFirst({
                    where: {
                        organizationId: targetOrgId,
                        OR: [
                            { userId: user.id },
                            { email: { equals: user.email.toLowerCase(), mode: "insensitive" } },
                        ],
                    },
                });
            }

            const isCustomerAccount = user.accountType === "CUSTOMER" || (!activeMembership && user.memberships.length === 0);

            if (targetOrgId && !user.isPlatformAdmin && !activeMembership && !activeCustomer && !isCustomerAccount) {
                throw new ForbiddenException({
                    code: "CROSS_TENANT_ACCESS_DENIED",
                    message: "The selected workspace is not available to this account.",
                });
            }

            const roleCode = activeMembership?.roleCode as RoleCode | undefined;
            if ((user.isPlatformAdmin || roleCode === RoleCode.OWNER || roleCode === RoleCode.ADMIN) && !payload.amr?.includes("mfa")) {
                throw new ForbiddenException({ code: "MFA_REQUIRED", message: "MFA verification is required for this privileged account." });
            }
            let permissions: PermissionKey[] = [];

            let actorType: ActorType = ActorType.SYSTEM;
            if (user.isPlatformAdmin) {
                actorType = ActorType.PLATFORM_ADMIN;
                permissions = Object.values(PermissionKey);
            } else if (activeMembership) {
                actorType = ActorType.STAFF;
                permissions = await this.authService.getPermissionsForRole(
                    roleCode,
                    activeMembership.organizationId,
                );
            } else if (activeCustomer || isCustomerAccount) {
                actorType = ActorType.CUSTOMER;
                permissions = [
                    PermissionKey.AI_EXECUTE,
                    PermissionKey.SERVICE_READ,
                    PermissionKey.LOCATION_READ,
                    PermissionKey.APPOINTMENT_READ,
                    PermissionKey.APPOINTMENT_CREATE,
                    PermissionKey.APPOINTMENT_MUTATE,
                    PermissionKey.APPOINTMENT_CANCEL,
                ];
            }

            const resolvedOrgId = targetOrgId || activeMembership?.organizationId || activeCustomer?.organizationId;

            request.context = {
                requestId: request.context?.requestId || "req_" + Date.now(),
                correlationId: request.context?.correlationId || "corr_" + Date.now(),
                actorType,
                subjectId: user.id,
                customerId: activeCustomer?.id,
                sessionId: payload.sid,
                organizationId: resolvedOrgId,
                membershipId: activeMembership?.id,
                roleCode: roleCode,
                permissions: permissions,
                locationIds: activeMembership?.locationIds
                    ? (activeMembership.locationIds as string[])
                    : undefined,
                locale: request.context?.locale || "en-US",
                timezone: request.context?.timezone || "UTC",
                isPlatformAdmin: user.isPlatformAdmin,
                ipAddress: request.context?.ipAddress,
                userAgent: request.context?.userAgent,
                issuedAt: new Date().toISOString(),
            };

            return true;
        } catch (err) {
            if (isPublic) {
                return true;
            }
            if (err instanceof ForbiddenException || err instanceof UnauthorizedException) {
                throw err;
            }
            throw new UnauthorizedException({
                code: "INVALID_TOKEN",
                message: "Invalid or expired token",
            });
        }
    }
}
