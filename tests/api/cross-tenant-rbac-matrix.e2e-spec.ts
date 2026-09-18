import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import * as jwt from "jsonwebtoken";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/database/prisma.service";
import { PAYMENT_PROVIDER } from "../src/modules/payments/payment-provider.interface";
import { TestPaymentAdapter } from "../src/modules/payments/test-payment.adapter";
import { RoleCode, PermissionKey, ActorType } from "@bookpro/contracts";

describe("Cross-Tenant and Under-Permissioned Route RBAC Matrix (E2E Exit Tests)", () => {
    let app: INestApplication;
    let prisma: PrismaService;

    const jwtSecret = process.env.JWT_SECRET || "bookpro-test-only-jwt-secret-change-me";

    // Tenant A IDs
    const orgAId = "00000000-0000-0000-0000-000000000001";
    const userOwnerAId = "00000000-0000-0000-0000-000000000010";
    const userCustomerAId = "00000000-0000-0000-0000-000000000020";
    const userStaffAId = "00000000-0000-0000-0000-000000000030";
    const staffProfile1Id = "00000000-0000-0000-0000-000000000031";
    const staffProfile2Id = "00000000-0000-0000-0000-000000000032";
    const membershipStaff1Id = "00000000-0000-0000-0000-000000000033";
    const locationA1 = "00000000-0000-0000-0000-000000000101";
    const locationA2 = "00000000-0000-0000-0000-000000000102";

    // Tenant B IDs
    const orgBId = "00000000-0000-0000-0000-000000000002";
    const userOwnerBId = "00000000-0000-0000-0000-000000000040";

    // Platform Admin ID
    const userPlatformAdminId = "00000000-0000-0000-0000-000000000099";

    // Tokens
    let tokenOwnerA: string;
    let tokenOwnerB: string;
    let tokenCustomerA: string;
    let tokenStaffScopedLoc1: string;
    let tokenPlatformAdmin: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(PAYMENT_PROVIDER)
            .useClass(TestPaymentAdapter)
            .compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        prisma = app.get<PrismaService>(PrismaService);

        // Setup mock DB records for users and memberships
        (jest.spyOn(prisma.user, "findUnique") as any).mockImplementation(async (args: any) => {
            const userId = args?.where?.id;
            if (userId === userOwnerAId) {
                return {
                    id: userOwnerAId,
                    email: "owner-a@bookpro.test",
                    isActive: true,
                    isPlatformAdmin: false,
                    memberships: [
                        {
                            id: "mem-owner-a",
                            organizationId: orgAId,
                            roleCode: RoleCode.OWNER,
                            status: "ACTIVE",
                            locationIds: [],
                        },
                    ],
                    customers: [],
                };
            }
            if (userId === userOwnerBId) {
                return {
                    id: userOwnerBId,
                    email: "owner-b@bookpro.test",
                    isActive: true,
                    isPlatformAdmin: false,
                    memberships: [
                        {
                            id: "mem-owner-b",
                            organizationId: orgBId,
                            roleCode: RoleCode.OWNER,
                            status: "ACTIVE",
                            locationIds: [],
                        },
                    ],
                    customers: [],
                };
            }
            if (userId === userCustomerAId) {
                return {
                    id: userCustomerAId,
                    email: "customer-a@bookpro.test",
                    isActive: true,
                    isPlatformAdmin: false,
                    memberships: [],
                    customers: [
                        {
                            id: "cust-a",
                            organizationId: orgAId,
                            userId: userCustomerAId,
                        },
                    ],
                };
            }
            if (userId === userStaffAId) {
                return {
                    id: userStaffAId,
                    email: "staff-a@bookpro.test",
                    isActive: true,
                    isPlatformAdmin: false,
                    memberships: [
                        {
                            id: membershipStaff1Id,
                            organizationId: orgAId,
                            roleCode: RoleCode.STAFF,
                            status: "ACTIVE",
                            locationIds: [locationA1],
                        },
                    ],
                    customers: [],
                };
            }
            if (userId === userPlatformAdminId) {
                return {
                    id: userPlatformAdminId,
                    email: "admin@bookpro.test",
                    isActive: true,
                    isPlatformAdmin: true,
                    memberships: [],
                    customers: [],
                };
            }
            return null;
        });

        (jest.spyOn(prisma.staffProfile, "findFirst") as any).mockImplementation(async (args: any) => {
            if (args?.where?.membershipId === membershipStaff1Id) {
                return { id: staffProfile1Id, membershipId: membershipStaff1Id };
            }
            return null;
        });

        (jest.spyOn(prisma.organization, "findUnique") as any).mockImplementation(async (args: any) => {
            return {
                id: args?.where?.id || orgAId,
                name: "Test Org",
                slug: "test-org",
                stripeAccountId: "acct_test123",
                paymentIntent: "ONLINE",
            };
        });

        (jest.spyOn(prisma.rolePermission, "findMany") as any).mockResolvedValue([]);
        (jest.spyOn(prisma.policyConfig, "findMany") as any).mockResolvedValue([]);
        (jest.spyOn(prisma.googleCalendarConnection, "findFirst") as any).mockResolvedValue(null);
        (jest.spyOn(prisma.googleCalendarConnection, "findMany") as any).mockResolvedValue([]);
        (jest.spyOn(prisma.service, "findMany") as any).mockResolvedValue([]);
        (jest.spyOn(prisma.customer, "findMany") as any).mockResolvedValue([]);
        (jest.spyOn(prisma.staffProfile, "findMany") as any).mockResolvedValue([]);
        (jest.spyOn(prisma.location, "findMany") as any).mockResolvedValue([]);
        (jest.spyOn(prisma, "$queryRaw") as any).mockResolvedValue([{ 1: 1 }]);

        // Generate signed JWT tokens for each persona
        tokenOwnerA = jwt.sign(
            {
                sub: userOwnerAId,
                email: "owner-a@bookpro.test",
                organizationId: orgAId,
                roleCode: RoleCode.OWNER,
                isPlatformAdmin: false,
            },
            jwtSecret
        );

        tokenOwnerB = jwt.sign(
            {
                sub: userOwnerBId,
                email: "owner-b@bookpro.test",
                organizationId: orgBId,
                roleCode: RoleCode.OWNER,
                isPlatformAdmin: false,
            },
            jwtSecret
        );

        tokenCustomerA = jwt.sign(
            {
                sub: userCustomerAId,
                email: "customer-a@bookpro.test",
                organizationId: orgAId,
                isPlatformAdmin: false,
            },
            jwtSecret
        );

        tokenStaffScopedLoc1 = jwt.sign(
            {
                sub: userStaffAId,
                email: "staff-a@bookpro.test",
                organizationId: orgAId,
                membershipId: membershipStaff1Id,
                roleCode: RoleCode.STAFF,
                isPlatformAdmin: false,
            },
            jwtSecret
        );

        tokenPlatformAdmin = jwt.sign(
            {
                sub: userPlatformAdminId,
                email: "admin@bookpro.test",
                isPlatformAdmin: true,
            },
            jwtSecret
        );
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });

    describe("1. Anonymous Requests (Unauthenticated)", () => {
        it("should reject unauthenticated request to refunds endpoint with 401 or 403", async () => {
            const res = await request(app.getHttpServer()).post(`/organizations/${orgAId}/refunds`).send({});
            expect([401, 403]).toContain(res.status);
        });

        it("should reject unauthenticated request to export download with 401 or 403", async () => {
            const res = await request(app.getHttpServer()).get(`/organizations/${orgAId}/exports/exp-1/download`);
            expect([401, 403]).toContain(res.status);
        });

        it("should reject unauthenticated request to storage upload with 401 or 403", async () => {
            const res = await request(app.getHttpServer()).post("/storage/upload").send({});
            expect([401, 403]).toContain(res.status);
        });

        it("should allow unauthenticated request to public reference timezones", async () => {
            const res = await request(app.getHttpServer()).get("/reference/timezones");
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("should allow unauthenticated request to public health endpoint", async () => {
            const res = await request(app.getHttpServer()).get("/health/liveness");
            expect(res.status).toBe(200);
            expect(res.body.status).toBe("ok");
        });
    });

    describe("2. Wrong Tenant Requests (Cross-Tenant Isolation)", () => {
        it("should reject Tenant A owner attempting to process refund on Tenant B", async () => {
            const res = await request(app.getHttpServer())
                .post(`/organizations/${orgBId}/refunds`)
                .set("Authorization", `Bearer ${tokenOwnerA}`)
                .send({ paymentRecordId: "pay-1", amountCents: 5000 });

            expect(res.status).toBe(403);
            expect(res.body.error?.code || res.body.code || res.body.message).toMatch(/CROSS_TENANT_ACCESS_DENIED|Cross-tenant/i);
        });

        it("should reject Tenant A owner attempting to download export from Tenant B", async () => {
            const res = await request(app.getHttpServer())
                .get(`/organizations/${orgBId}/exports/exp-1/download`)
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect(res.status).toBe(403);
            expect(res.body.error?.code || res.body.code || res.body.message).toMatch(/CROSS_TENANT_ACCESS_DENIED|Cross-tenant/i);
        });

        it("should reject Tenant A owner attempting to list waitlist entries on Tenant B", async () => {
            const res = await request(app.getHttpServer())
                .get(`/organizations/${orgBId}/waitlist/entries`)
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect(res.status).toBe(403);
            expect(res.body.error?.code || res.body.code || res.body.message).toMatch(/CROSS_TENANT_ACCESS_DENIED|Cross-tenant/i);
        });

        it("should reject Tenant A owner attempting to calculate pricing on Tenant B", async () => {
            const res = await request(app.getHttpServer())
                .post(`/organizations/${orgBId}/pricing/calculate`)
                .set("Authorization", `Bearer ${tokenOwnerA}`)
                .send({ serviceId: "svc-1" });

            expect(res.status).toBe(403);
            expect(res.body.error?.code || res.body.code || res.body.message).toMatch(/CROSS_TENANT_ACCESS_DENIED|Cross-tenant/i);
        });
    });

    describe("3. Correct Tenant / Wrong Role (Privilege Escalation Protection)", () => {
        it("should reject Customer attempting to update organization policy (missing org:update)", async () => {
            const res = await request(app.getHttpServer())
                .put("/policies")
                .set("Authorization", `Bearer ${tokenCustomerA}`)
                .send({ depositPercentage: 50 });

            expect(res.status).toBe(403);
            expect(res.body.error?.code || res.body.code || res.body.message).toMatch(/FORBIDDEN_PERMISSION|Missing required permissions/i);
        });

        it("should reject Customer attempting to trigger a refund (missing refund:manage)", async () => {
            const res = await request(app.getHttpServer())
                .post(`/organizations/${orgAId}/refunds`)
                .set("Authorization", `Bearer ${tokenCustomerA}`)
                .send({ paymentRecordId: "pay-1", amountCents: 1000 });

            expect(res.status).toBe(403);
            expect(res.body.error?.code || res.body.code || res.body.message).toMatch(/FORBIDDEN_PERMISSION|Missing required permissions/i);
        });

        it("should reject Staff member attempting to invite new staff (missing staff:invite)", async () => {
            const res = await request(app.getHttpServer())
                .post("/identity/invite")
                .set("Authorization", `Bearer ${tokenStaffScopedLoc1}`)
                .send({ email: "newstaff@test.com", roleCode: RoleCode.STAFF });

            expect(res.status).toBe(403);
            expect(res.body.error?.code || res.body.code || res.body.message).toMatch(/FORBIDDEN_PERMISSION|Missing required permissions/i);
        });

        it("should reject Customer attempting to disconnect Stripe (missing payment:manage)", async () => {
            const res = await request(app.getHttpServer())
                .post("/payments/stripe/disconnect")
                .set("Authorization", `Bearer ${tokenCustomerA}`);

            expect(res.status).toBe(403);
            expect(res.body.error?.code || res.body.code || res.body.message).toMatch(/FORBIDDEN_PERMISSION|Missing required permissions/i);
        });
    });

    describe("4. Location-Scoped Role (Location Boundary Enforcement)", () => {
        it("should reject Staff scoped to Location 1 querying Location 2 in query string", async () => {
            const res = await request(app.getHttpServer())
                .get(`/organizations/${orgAId}/search?locationId=${locationA2}&q=test`)
                .set("Authorization", `Bearer ${tokenStaffScopedLoc1}`);

            expect(res.status).toBe(403);
            expect(res.body.error?.code || res.body.code || res.body.message).toMatch(/LOCATION_SCOPE_DENIED|location/i);
        });

        it("should allow Staff scoped to Location 1 querying Location 1", async () => {
            const res = await request(app.getHttpServer())
                .get(`/organizations/${orgAId}/search?locationId=${locationA1}&q=test`)
                .set("Authorization", `Bearer ${tokenStaffScopedLoc1}`);

            expect([200, 201]).toContain(res.status);
        });
    });

    describe("5. Tenant Owner / Admin Access", () => {
        it("should allow Tenant Owner full access to their organization policies", async () => {
            const res = await request(app.getHttpServer())
                .get("/policies")
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect([200, 201]).toContain(res.status);
        });

        it("should allow Tenant Owner to check Stripe Connect status", async () => {
            const res = await request(app.getHttpServer())
                .get("/payments/stripe/status")
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect([200, 201]).toContain(res.status);
        });
    });

    describe("6. Platform Admin Access", () => {
        it("should allow Platform Admin access to platform health endpoint", async () => {
            const res = await request(app.getHttpServer())
                .get("/platform/health")
                .set("Authorization", `Bearer ${tokenPlatformAdmin}`);

            expect(res.status).toBe(200);
        });

        it("should allow Platform Admin to query resources across tenants without cross-tenant block", async () => {
            const res = await request(app.getHttpServer())
                .get(`/organizations/${orgBId}/search?q=test`)
                .set("Authorization", `Bearer ${tokenPlatformAdmin}`);

            expect([200, 201]).toContain(res.status);
        });
    });

    describe("7. Object Ownership (Staff Google Calendar Integration)", () => {
        it("should reject Customer attempting to check staff calendar status", async () => {
            const res = await request(app.getHttpServer())
                .get(`/integrations/google/status?staffId=${staffProfile1Id}`)
                .set("Authorization", `Bearer ${tokenCustomerA}`);

            expect(res.status).toBe(403);
            expect(res.body.error?.message || res.body.message).toMatch(/Missing required permissions|Customer accounts are not authorized/i);
        });

        it("should reject Staff 1 attempting to access Staff 2 calendar without management permission", async () => {
            const res = await request(app.getHttpServer())
                .get(`/integrations/google/status?staffId=${staffProfile2Id}`)
                .set("Authorization", `Bearer ${tokenStaffScopedLoc1}`);

            expect(res.status).toBe(403);
            expect(res.body.error?.message || res.body.message).toMatch(/You are not authorized to manage this staff member's calendar integration/i);
        });

        it("should allow Staff 1 to access their own calendar integration", async () => {
            const res = await request(app.getHttpServer())
                .get(`/integrations/google/status?staffId=${staffProfile1Id}`)
                .set("Authorization", `Bearer ${tokenStaffScopedLoc1}`);

            expect([200, 201]).toContain(res.status);
        });

        it("should allow Owner to access any staff calendar integration in their tenant", async () => {
            const res = await request(app.getHttpServer())
                .get(`/integrations/google/status?staffId=${staffProfile2Id}`)
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect([200, 201]).toContain(res.status);
        });
    });
});
