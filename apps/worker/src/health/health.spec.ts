import { HealthService } from "./health.service";

describe("Worker HealthService Unit Test Suite", () => {
    let mockPrisma: any;
    let mockRedis: any;

    beforeEach(() => {
        mockPrisma = {
            $queryRaw: jest.fn().mockResolvedValue([{ age_seconds: 12 }]),
            outboxEvent: {
                count: jest.fn().mockResolvedValue(0),
            },
        };

        mockRedis = {
            ping: jest.fn().mockResolvedValue(true),
        };
    });

    it("should return healthy state when DB, Redis, and providers are healthy", async () => {
        process.env.EMAIL_PROVIDER = "brevo";
        process.env.BREVO_API_KEY = "test_key";
        process.env.BREVO_SENDER_EMAIL = "test@bookpro.com";
        process.env.SMS_PROVIDER = "disabled";

        const healthService = new HealthService(mockPrisma, mockRedis);
        const report = await healthService.getReadinessHealth();

        expect(report.status).toBe("healthy");
        expect(report.role).toBe("worker");
        expect(report.database.status).toBe("UP");
        expect(report.redis.status).toBe("UP");
        expect(report.providers.email.configured).toBe(true);
        expect(report.providers.sms.mode).toBe("disabled");
    });

    it("should return unhealthy when database connection query fails", async () => {
        mockPrisma.$queryRaw.mockRejectedValue(new Error("Connection refused"));

        const healthService = new HealthService(mockPrisma, mockRedis);
        const report = await healthService.getReadinessHealth();

        expect(report.status).toBe("unhealthy");
        expect(report.database.status).toBe("DOWN");
        expect(report.database.error).toContain("Connection refused");
    });

    it("should return unhealthy when Redis ping fails", async () => {
        mockRedis.ping.mockResolvedValue(false);

        const healthService = new HealthService(mockPrisma, mockRedis);
        const report = await healthService.getReadinessHealth();

        expect(report.status).toBe("unhealthy");
        expect(report.redis.status).toBe("DOWN");
    });

    it("should return degraded when outbox has stale leases", async () => {
        mockPrisma.outboxEvent.count = jest.fn().mockImplementation(({ where }) => {
            if (where?.status === "PROCESSING" && where?.leaseExpiresAt?.lte) {
                return Promise.resolve(3); // 3 stale leases!
            }
            return Promise.resolve(0);
        });

        const healthService = new HealthService(mockPrisma, mockRedis);
        const report = await healthService.getReadinessHealth();

        expect(report.status).toBe("degraded");
        expect(report.outboxLag.staleLeasesCount).toBe(3);
    });
});
