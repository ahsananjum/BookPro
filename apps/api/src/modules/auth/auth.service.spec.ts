import { Test, TestingModule } from "@nestjs/testing";
import { AuthService, parseDurationToMs } from "./auth.service";
import { PrismaService } from "../database/prisma.service";
import { RoleCode, PermissionKey } from "@bookpro/contracts";
import { verifyEmailSchema } from "@bookpro/validation";
import * as crypto from "crypto";

describe("AuthService", () => {
    let service: AuthService;
    let prisma: PrismaService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                {
                    provide: PrismaService,
                    useValue: {
                        user: {
                            findUnique: jest.fn(),
                            create: jest.fn(),
                            update: jest.fn(),
                        },
                        rolePermission: {
                            findMany: jest.fn().mockResolvedValue([]),
                        },
                        invitation: {
                            findUnique: jest.fn(),
                            update: jest.fn(),
                        },
                        membership: {
                            upsert: jest.fn(),
                        },
                        auditLog: {
                            create: jest.fn(),
                        },
                        emailVerificationToken: {
                            findFirst: jest.fn(),
                            update: jest.fn(),
                        },
                        authRateLimit: {
                            findUnique: jest.fn().mockResolvedValue(null),
                            upsert: jest.fn().mockResolvedValue({ attempts: 1 }),
                            update: jest.fn(),
                            deleteMany: jest.fn(),
                        },
                        customer: {
                            findFirst: jest.fn(),
                            findMany: jest.fn(),
                            create: jest.fn(),
                            update: jest.fn(),
                        },
                        authSession: {
                            findFirst: jest.fn(),
                            update: jest.fn(),
                        },
                    },
                },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    it("should be defined", () => {
        expect(service).toBeDefined();
    });

    it("should return default permissions for OWNER role when custom rules are empty", async () => {
        const perms = await service.getPermissionsForRole(RoleCode.OWNER);
        expect(perms).toContain(PermissionKey.ORG_READ);
        expect(perms).toContain(PermissionKey.STAFF_MANAGE);
        expect(perms).not.toContain(PermissionKey.PLATFORM_ADMIN);
    });

    it("should return default permissions for RECEPTIONIST role", async () => {
        const perms = await service.getPermissionsForRole(RoleCode.RECEPTIONIST);
        expect(perms).toContain(PermissionKey.APPOINTMENT_CREATE);
        expect(perms).not.toContain(PermissionKey.STAFF_MANAGE);
    });

    it("rejects malformed verification payloads before the service runs", () => {
        expect(() => verifyEmailSchema.parse({ email: "owner@example.com", token: "12345" })).toThrow();
        expect(() => verifyEmailSchema.parse({ email: "owner@example.com", token: "12345x" })).toThrow();
        expect(() => verifyEmailSchema.parse({ token: "123456" })).toThrow();
        expect(verifyEmailSchema.parse({ email: "OWNER@EXAMPLE.COM", token: "123456" })).toEqual({
            email: "owner@example.com",
            token: "123456",
        });
    });

    it("salts verification code hashes with the normalized email", () => {
        const hash = (service as any).hashVerificationCode("Owner@Example.com", "482901");
        expect(hash).toBe((service as any).hashVerificationCode("owner@example.com", "482901"));
        expect(hash).not.toBe((service as any).hashVerificationCode("other@example.com", "482901"));
    });

    it("never repeats the immediately previous verification code", () => {
        const previousHash = (service as any).hashVerificationCode("owner@example.com", "482901");
        for (let i = 0; i < 20; i++) {
            const code = (service as any).generateVerificationCode("owner@example.com", previousHash);
            expect(code).not.toBe("482901");
            expect(code).toMatch(/^[0-9]{6}$/);
        }
    });

    it("limits a verification lookup to the submitted customer email and counts a wrong attempt", async () => {
        const tokenStore = (prisma as any).emailVerificationToken;
        tokenStore.findFirst.mockResolvedValue({
            id: "token-id",
            tokenHash: (service as any).hashVerificationCode("owner@example.com", "482901"),
            expiresAt: new Date(Date.now() + 60_000),
            consumedAt: null,
            attempts: 0,
            user: { id: "user-id", email: "owner@example.com" },
            organization: { id: "org-id" },
        });

        await expect(service.verifyEmail("111111", "owner@example.com")).rejects.toMatchObject({
            response: { code: "VERIFICATION_CODE_INCORRECT" },
        });
        expect(tokenStore.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ user: { email: "owner@example.com" } }),
        }));
        expect(tokenStore.update).toHaveBeenCalledWith({ where: { id: "token-id" }, data: { attempts: 1 } });
    });

    describe("selectCustomerOrganization membership enforcement", () => {
        it("rejects selecting an organization if customer relationship does not exist", async () => {
            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                id: "user-1",
                email: "customer@example.com",
                accountType: "CUSTOMER",
            });
            (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);

            await expect(
                service.selectCustomerOrganization("user-1", "unjoined-org-id", "session-1")
            ).rejects.toMatchObject({
                response: { code: "CUSTOMER_NOT_FOUND" },
            });
            expect(prisma.customer.create).not.toHaveBeenCalled();
        });

        it("rejects selecting an organization if the organization is inactive or archived", async () => {
            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                id: "user-1",
                email: "customer@example.com",
                accountType: "CUSTOMER",
            });
            // DB query filters organization: { isActive: true, archivedAt: null }, so returns null
            (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);

            await expect(
                service.selectCustomerOrganization("user-1", "inactive-org-id", "session-1")
            ).rejects.toMatchObject({
                response: { code: "CUSTOMER_NOT_FOUND" },
            });
        });

        it("selects organization and returns token when valid customer relationship exists", async () => {
            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                id: "user-1",
                email: "customer@example.com",
                accountType: "CUSTOMER",
            });
            (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
                id: "cust-1",
                organizationId: "org-1",
                userId: "user-1",
                organization: { id: "org-1", name: "Luxe Studio", slug: "luxe-studio" },
            });
            (prisma.authSession.findFirst as jest.Mock).mockResolvedValue({
                id: "session-1",
                userId: "user-1",
                authLevel: "pwd",
            });
            (prisma.authSession.update as jest.Mock).mockResolvedValue({});

            const res = await service.selectCustomerOrganization("user-1", "org-1", "session-1");

            expect(res.organization.id).toBe("org-1");
            expect(res.organization.slug).toBe("luxe-studio");
            expect(res.accessToken).toBeDefined();
            expect(prisma.authSession.update).toHaveBeenCalledWith({
                where: { id: "session-1" },
                data: { organizationId: "org-1" },
            });
            expect(prisma.customer.create).not.toHaveBeenCalled();
        });
    });

    describe("Session lifetime and duration parsing", () => {
        it("parses duration strings into milliseconds accurately", () => {
            expect(parseDurationToMs("30s", 1000)).toBe(30_000);
            expect(parseDurationToMs("15m", 1000)).toBe(15 * 60 * 1000);
            expect(parseDurationToMs("24h", 1000)).toBe(24 * 60 * 60 * 1000);
            expect(parseDurationToMs("7d", 1000)).toBe(7 * 24 * 60 * 60 * 1000);
            expect(parseDurationToMs("2w", 1000)).toBe(14 * 24 * 60 * 60 * 1000);
            expect(parseDurationToMs(undefined, 5000)).toBe(5000);
            expect(parseDurationToMs("invalid", 5000)).toBe(5000);
        });

        it("exposes extended session and JWT durations", () => {
            expect(service.getJwtExpiresIn()).toBe("7d");
            expect(service.getJwtExpiresInMs()).toBe(7 * 24 * 60 * 60 * 1000);
            expect(service.getRefreshLifetimeMs()).toBe(30 * 24 * 60 * 60 * 1000);
        });
    });
});
