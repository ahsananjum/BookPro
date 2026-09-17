import { Test, TestingModule } from "@nestjs/testing";
import { EntitlementsService } from "./entitlements.service";
import { PrismaService } from "../database/prisma.service";
import { ForbiddenException } from "@nestjs/common";

describe("EntitlementsService", () => {
    let service: EntitlementsService;
    let prisma: PrismaService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EntitlementsService,
                {
                    provide: PrismaService,
                    useValue: {
                        featureOverride: {
                            findUnique: jest.fn().mockResolvedValue(null),
                        },
                        entitlement: {
                            findFirst: jest.fn().mockResolvedValue(null),
                        },
                    },
                },
            ],
        }).compile();

        service = module.get<EntitlementsService>(EntitlementsService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    it("should be defined", () => {
        expect(service).toBeDefined();
    });

    it("should allow operation when currentCount is below default starter limit", async () => {
        const result = await service.checkLimit("org-123", "maxStaff", 2);
        expect(result).toBe(true);
    });

    it("should throw ForbiddenException when currentCount equals or exceeds allowed limit", async () => {
        await expect(service.checkLimit("org-123", "maxStaff", 5)).rejects.toThrow(ForbiddenException);
    });
});
