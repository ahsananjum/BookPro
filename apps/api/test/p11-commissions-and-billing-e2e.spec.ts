import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import * as jwt from "jsonwebtoken";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/database/prisma.service";
import { PAYMENT_PROVIDER } from "../src/modules/payments/payment-provider.interface";
import { TestPaymentAdapter } from "../src/modules/payments/test-payment.adapter";
import { RoleCode } from "@bookpro/contracts";

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
                roleCode: "CUSTOMER",
                isPlatformAdmin: false,
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
                .get(`/api/v1/commissions/organizations/${orgAId}/summary`)
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
                .get(`/api/v1/commissions/organizations/${orgAId}/rules`)
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it("should create a new commission rule and enforce validation", async () => {
            const newRulePayload = {
                name: "E2E Senior Specialist Rate",
                type: "PERCENTAGE",
                rate: 2500, // 25%
                serviceCategory: "Styling",
                minServicePriceCents: 5000,
                isActive: true,
            };

            const res = await request(app.getHttpServer())
                .post(`/api/v1/commissions/organizations/${orgAId}/rules`)
                .set("Authorization", `Bearer ${tokenOwnerA}`)
                .send(newRulePayload);

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty("id");
            expect(res.body.name).toBe("E2E Senior Specialist Rate");
            expect(res.body.rate).toBe(2500);
            createdRuleId = res.body.id;
        });

        it("should update existing commission rule", async () => {
            if (!createdRuleId) return;

            const updatePayload = {
                name: "E2E Senior Specialist Rate (Updated)",
                rate: 3000, // 30%
                isActive: false,
            };

            const res = await request(app.getHttpServer())
                .put(`/api/v1/commissions/organizations/${orgAId}/rules/${createdRuleId}`)
                .set("Authorization", `Bearer ${tokenOwnerA}`)
                .send(updatePayload);

            expect(res.status).toBe(200);
            expect(res.body.rate).toBe(3000);
            expect(res.body.isActive).toBe(false);
        });

        it("should delete created commission rule", async () => {
            if (!createdRuleId) return;

            const res = await request(app.getHttpServer())
                .delete(`/api/v1/commissions/organizations/${orgAId}/rules/${createdRuleId}`)
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("deleted", true);
        });

        it("should list commission ledger entries with staff and service relation details", async () => {
            const res = await request(app.getHttpServer())
                .get(`/api/v1/commissions/organizations/${orgAId}/ledger`)
                .set("Authorization", `Bearer ${tokenOwnerA}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("entries");
            expect(res.body).toHaveProperty("total");
            expect(Array.isArray(res.body.entries)).toBe(true);
        });
    });

    describe("3. Customer Portal Billing & Receipts API", () => {
        it("should return customer billing history and official invoices", async () => {
            const res = await request(app.getHttpServer())
                .get(`/api/v1/customer-portal/billing?tenantSlug=luxury-salon`)
                .set("Authorization", `Bearer ${tokenCustomerA}`);

            // Even if customer has no transactions, it must return a valid structured payload
            expect([200, 404]).toContain(res.status);
            if (res.status === 200) {
                expect(res.body).toHaveProperty("customer");
                expect(res.body).toHaveProperty("organization");
                expect(res.body).toHaveProperty("transactions");
                expect(res.body).toHaveProperty("summary");
            }
        });
    });
});
