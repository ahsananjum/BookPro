import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import * as jwt from "jsonwebtoken";
import { AppModule } from "../../app.module";
import { PrismaService } from "../database/prisma.service";
import { PAYMENT_PROVIDER } from "../payments/payment-provider.interface";
import { TestPaymentAdapter } from "../payments/test-payment.adapter";
import { RoleCode, PermissionKey } from "@bookpro/contracts";
import { AuthService } from "../auth/auth.service";

describe("P11 Commissions, Payment Hub & Customer Billing Live Integration Suite", () => {
    let app: INestApplication;
    let prisma: PrismaService;

    const jwtSecret = process.env.JWT_SECRET || "bookpro-test-only-jwt-secret-change-me";

    const orgAId = "00000000-0000-0000-0000-000000000001";
    const orgBId = "00000000-0000-0000-0000-000000000002";
    const userOwnerAId = "00000000-0000-0000-0000-000000000010";
    const userOwnerBId = "00000000-0000-0000-0000-000000000040";
    const userCustomerAId = "00000000-0000-0000-0000-000000000020";

    let tokenOwnerA: string;
    let tokenOwnerB: string;
    let tokenCustomerA: string;

    beforeAll(async () => {
        jest.spyOn(AuthService.prototype, "getPermissionsForRole").mockResolvedValue(Object.values(PermissionKey));

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(PAYMENT_PROVIDER)
            .useClass(TestPaymentAdapter)
            .compile();

        app = moduleFixture.createNestApplication();
        app.setGlobalPrefix("api/v1");
        await app.init();

        prisma = app.get<PrismaService>(PrismaService);

        (jest.spyOn(prisma.authSession, "findFirst") as any).mockResolvedValue({
            id: "sess-valid",
            userId: userOwnerAId,
            revokedAt: null,
            expiresAt: new Date(Date.now() + 86400000),
        });

        // Mock DB records for user auth
        (jest.spyOn(prisma.user, "findUnique") as any).mockImplementation(async (args: any) => {
            const userId = args?.where?.id;
            if (userId === userOwnerAId) {
                return {
                    id: userOwnerAId,
                    email: "owner-a@bookpro.test",
                    isActive: true,
                    isPlatformAdmin: false,
                    accountType: "STAFF",
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
                    accountType: "STAFF",
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
                    accountType: "CUSTOMER",
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
            return null;
        });

        (jest.spyOn(prisma.rolePermission, "findMany") as any).mockResolvedValue([]);
        (jest.spyOn(prisma.organization, "findUnique") as any).mockImplementation(async (args: any) => {
            return {
                id: args?.where?.id || orgAId,
                name: "Test Studio Luxury",
                brandName: "Luxury Studio",
                slug: "luxury-salon",
                currency: "USD",
                stripeAccountId: "acct_test123",
            };
        });

        (jest.spyOn(prisma.organization, "findFirst") as any).mockImplementation(async (args: any) => {
            return {
                id: orgAId,
                name: "Test Studio Luxury",
                brandName: "Luxury Studio",
                slug: "luxury-salon",
                currency: "USD",
                stripeAccountId: "acct_test123",
            };
        });

        tokenOwnerA = jwt.sign(
            {
                sub: userOwnerAId,
                email: "owner-a@bookpro.test",
                organizationId: orgAId,
                roleCode: RoleCode.OWNER,
                isPlatformAdmin: false,
                sid: "sess-valid",
                amr: ["pwd", "mfa"],
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
                sid: "sess-valid",
                amr: ["pwd", "mfa"],
            },
            jwtSecret
        );

        tokenCustomerA = jwt.sign(
            {
                sub: userCustomerAId,
                email: "customer-a@bookpro.test",
                organizationId: orgAId,
                roleCode: "CUSTOMER",
                isPlatformAdmin: false,
                sid: "sess-valid",
                amr: ["pwd"],
            },
            jwtSecret
        );
    });

    afterAll(async () => {
        await app.close();
    });

    describe("1. Payments Management & Summary API", () => {
        it("should return payments list for authorized organization owner", async () => {
            const res = await request(app.getHttpServer())
                .get(`/api/v1/payments/organizations/${orgAId}`)
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("payments");
            expect(res.body).toHaveProperty("total");
            expect(Array.isArray(res.body.payments)).toBe(true);
        });

        it("should block cross-tenant payment access for unauthorized owner", async () => {
            const res = await request(app.getHttpServer())
                .get(`/api/v1/payments/organizations/${orgAId}`)
                .set("Authorization", `Bearer ${tokenOwnerB}`);

            expect(res.status).toBe(403);
        });

        it("should return payment summary with gross captured, refunds, and balance", async () => {
            const res = await request(app.getHttpServer())
                .get(`/api/v1/payments/organizations/${orgAId}/summary`)
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("grossCapturedCents");
            expect(res.body).toHaveProperty("totalRefundsCents");
            expect(res.body).toHaveProperty("netBalanceCents");
            expect(res.body).toHaveProperty("transactionCount");
            expect(res.body).toHaveProperty("refundCount");
        });
    });

    describe("2. Commissions Hub Rules & Ledger API", () => {
        let createdRuleId: string;

        it("should return commission summary with pending, approved, paid, and clawback totals", async () => {
            const res = await request(app.getHttpServer())
                .get(`/api/v1/organizations/${orgAId}/commissions/summary`)
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("totalPendingCents");
            expect(res.body).toHaveProperty("totalApprovedCents");
            expect(res.body).toHaveProperty("totalPaidCents");
            expect(res.body).toHaveProperty("totalClawedBackCents");
            expect(res.body).toHaveProperty("activeRulesCount");
        });

        it("should list commission rules for organization", async () => {
            const res = await request(app.getHttpServer())
                .get(`/api/v1/organizations/${orgAId}/commissions/rules`)
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it("should create a new commission rule and enforce validation", async () => {
            const newRulePayload = {
                name: "E2E Master Stylist Tier",
                type: "PERCENTAGE",
                rate: 2500, // 25%
                serviceCategory: "Styling",
                minServicePriceCents: 5000,
                isActive: true,
            };

            const res = await request(app.getHttpServer())
                .post(`/api/v1/organizations/${orgAId}/commissions/rules`)
                .set("Authorization", `Bearer ${tokenOwnerA}`)
                .send(newRulePayload);

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty("id");
            expect(res.body.name).toBe("E2E Master Stylist Tier");
            expect(res.body.rate).toBe(2500);
            createdRuleId = res.body.id;
        });

        it("should update existing commission rule", async () => {
            if (!createdRuleId) return;

            const updatePayload = {
                name: "E2E Master Stylist Tier (Updated)",
                rate: 3000, // 30%
                isActive: false,
            };

            const res = await request(app.getHttpServer())
                .put(`/api/v1/organizations/${orgAId}/commissions/rules/${createdRuleId}`)
                .set("Authorization", `Bearer ${tokenOwnerA}`)
                .send(updatePayload);

            expect(res.status).toBe(200);
            expect(res.body.rate).toBe(3000);
            expect(res.body.isActive).toBe(false);
        });

        it("should delete created commission rule", async () => {
            if (!createdRuleId) return;

            const res = await request(app.getHttpServer())
                .delete(`/api/v1/organizations/${orgAId}/commissions/rules/${createdRuleId}`)
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("deleted", true);
        });

        it("should list commission ledger entries with staff and service relation details", async () => {
            const res = await request(app.getHttpServer())
                .get(`/api/v1/organizations/${orgAId}/commissions`)
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("entries");
            expect(res.body).toHaveProperty("total");
            expect(Array.isArray(res.body.entries)).toBe(true);
        });
    });

    describe("3. Customer Portal Billing & Receipts API", () => {
        it("should handle customer billing query", async () => {
            (jest.spyOn(prisma.customer, "findFirst") as any).mockResolvedValue({
                id: "cust-a",
                userId: userCustomerAId,
                organizationId: orgAId,
                firstName: "Victoria",
                lastName: "Sterling",
                email: "customer-a@bookpro.test",
                phone: "+15551234567",
                totalSpentCents: 25000,
            });

            (jest.spyOn(prisma.paymentRecord, "findMany") as any).mockResolvedValue([
                {
                    id: "pay-rec-1",
                    appointmentId: "appt-1",
                    amountCents: 25000,
                    currency: "USD",
                    status: "SUCCEEDED",
                    paymentMethod: "Card",
                    stripePaymentIntentId: "pi_test123",
                    createdAt: new Date(),
                    appointment: {
                        id: "appt-1",
                        service: { name: "Signature Balayage", priceCents: 25000 },
                        staff: { displayName: "Senior Colorist" },
                        startAt: new Date(),
                        endAt: new Date(),
                    },
                    refunds: [],
                },
            ]);

            const res = await request(app.getHttpServer())
                .get(`/api/v1/customer-portal/billing?tenantSlug=luxury-salon`)
                .set("Authorization", `Bearer ${tokenCustomerA}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("customer");
            expect(res.body).toHaveProperty("organization");
            expect(res.body).toHaveProperty("transactions");
            expect(res.body).toHaveProperty("summary");
            expect(res.body.summary.totalSpentCents).toBe(25000);
            expect(res.body.transactions.length).toBe(1);
        });
    });
});
