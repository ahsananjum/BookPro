import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./modules/health/health.controller";
import { HealthCheckService } from "@nestjs/terminus";
import { SystemHealthIndicator } from "@bookpro/observability";

describe("HealthController", () => {
    let controller: HealthController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [HealthController],
            providers: [
                {
                    provide: HealthCheckService,
                    useValue: { check: jest.fn().mockResolvedValue({ status: "ok" }) },
                },
                {
                    provide: SystemHealthIndicator,
                    useValue: {
                        checkDatabase: jest.fn().mockResolvedValue({ database: { status: "up" } }),
                        checkRedis: jest.fn().mockResolvedValue({ redis: { status: "up" } }),
                    },
                },
            ],
        }).compile();

        controller = module.get<HealthController>(HealthController);
    });

    it("should return liveness ok", () => {
        const res = controller.liveness();
        expect(res.status).toBe("ok");
        expect(res.timestamp).toBeDefined();
    });

    it("should return readiness ready", () => {
        const res = controller.readiness();
        expect(res.status).toBe("ready");
    });
});
