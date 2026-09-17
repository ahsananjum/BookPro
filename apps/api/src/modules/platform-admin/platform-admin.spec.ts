import { PlatformAdminService } from "./platform-admin.service";

describe("PlatformAdminService — Support Auditing & Infrastructure Telemetry", () => {
    let service: PlatformAdminService;
    let mockPrisma: any;
    let mockRedis: any;

    beforeEach(() => {
        mockPrisma = {
            $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
            googleCalendarConnection: {
                count: jest.fn().mockResolvedValue(5),
            },
            outboxEvent: {
                count: jest.fn().mockResolvedValue(0),
                findMany: jest.fn().mockResolvedValue([]),
            },
            organization: {
                count: jest.fn().mockResolvedValue(3),
                findMany: jest.fn().mockResolvedValue([]),
            },
            appointment: {
                count: jest.fn().mockResolvedValue(42),
            },
            webhookInbox: {
                count: jest.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(1),
            },
            auditLog: {
                create: jest.fn().mockResolvedValue({ id: "aud-supp" }),
            },
        };

        mockRedis = {
            getIsConnected: jest.fn().mockReturnValue(true),
            getClient: jest.fn().mockReturnValue({ ping: jest.fn().mockResolvedValue("PONG") }),
        };

        service = new PlatformAdminService(mockPrisma, mockRedis);
    });

    it("evaluates platform health metrics across database, redis, and queues", async () => {
        const health = await service.getSystemHealth();

        expect(health.database.status).toBe("HEALTHY");
        expect(health.redis.status).toBe("HEALTHY");
        expect(health.integrations.googleCalendar.connectedCount).toBe(5);
        expect(health.activeTenantsCount).toBe(3);
    });

    it("generates an immutable PLATFORM_SUPPORT audit log when support impersonation is initiated", async () => {
        const result = await service.logSupportAccess(
            "admin-123",
            "org-target-999",
            "Ticket #1042 - Resolving payment webhook incident"
        );

        expect(result.accessGranted).toBe(true);
        expect(result.sessionRef).toContain("supp_");
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: "org-target-999",
                    actorType: "PLATFORM_SUPPORT",
                    actorId: "admin-123",
                    action: "support.tenant_access_initiated",
                    payload: expect.objectContaining({
                        reason: "Ticket #1042 - Resolving payment webhook incident",
                    }),
                }),
            })
        );
    });
});
