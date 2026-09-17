import { ActorType } from "@bookpro/contracts";
import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "./auth.guard";

describe("AuthGuard public optional authentication", () => {
    const customer = {
        id: "user-1",
        isActive: true,
        isPlatformAdmin: false,
        accountType: "CUSTOMER",
        memberships: [],
        customers: [{ id: "customer-1", organizationId: "org-1" }],
    };

    function contextFor(request: any): ExecutionContext {
        return {
            switchToHttp: () => ({ getRequest: () => request }),
            getHandler: () => function handler() {},
            getClass: () => class Controller {},
        } as unknown as ExecutionContext;
    }

    it("keeps a public endpoint anonymous when no authentication cookie exists", async () => {
        const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
        const auth = { validateToken: jest.fn(), validateSession: jest.fn() };
        const prisma = { user: { findUnique: jest.fn() } };
        const guard = new AuthGuard(reflector, auth as any, prisma as any);
        const request = { headers: {}, header: jest.fn(), context: {} };

        await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
        expect(auth.validateToken).not.toHaveBeenCalled();
        expect(request.context).toEqual({});
    });

    it("hydrates verified customer context on a public booking endpoint", async () => {
        const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
        const auth = {
            validateToken: jest.fn().mockResolvedValue({ sub: "user-1", sid: "session-1", organizationId: "org-1", amr: ["pwd"] }),
            validateSession: jest.fn().mockResolvedValue(undefined),
        };
        const prisma = { user: { findUnique: jest.fn().mockResolvedValue(customer) } };
        const guard = new AuthGuard(reflector, auth as any, prisma as any);
        const request: any = {
            headers: { cookie: "access_token=valid-token" },
            header: jest.fn().mockReturnValue(undefined),
            context: { requestId: "request-1", correlationId: "correlation-1" },
        };

        await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
        expect(auth.validateToken).toHaveBeenCalledWith("valid-token");
        expect(request.context).toEqual(expect.objectContaining({
            actorType: ActorType.CUSTOMER,
            subjectId: "user-1",
            customerId: "customer-1",
            organizationId: "org-1",
        }));
    });
});
