import { Test, TestingModule } from "@nestjs/testing";
import { CrmService } from "./crm.service";
import { PrismaService } from "../database/prisma.service";
import { CustomerPortalService } from "../customer-portal/customer-portal.service";
import { ConflictException, BadRequestException, NotFoundException } from "@nestjs/common";

describe("CrmService", () => {
    let service: CrmService;
    let prisma: any;
    let customerPortalService: any;

    const mockOrgId = "org_123";
    const mockStaffId = "staff_456";

    beforeEach(async () => {
        prisma = {
            customer: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
            customerInvitation: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
            },
            user: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
            },
            customerNote: {
                create: jest.fn(),
            },
            auditLog: {
                create: jest.fn(),
            },
            organization: {
                findUnique: jest.fn().mockResolvedValue({ currency: "USD" }),
            },
            $transaction: jest.fn((callback) => callback(prisma)),
        };

        customerPortalService = {
            invite: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CrmService,
                { provide: PrismaService, useValue: prisma },
                { provide: CustomerPortalService, useValue: customerPortalService },
            ],
        }).compile();

        service = module.get<CrmService>(CrmService);
    });

    describe("listCustomers", () => {
        it("should return tenant-isolated customer list with linked user and calculated LTV", async () => {
            const mockDbCustomers = [
                {
                    id: "cust_1",
                    organizationId: mockOrgId,
                    fullName: "Alice Smith",
                    email: "alice@example.com",
                    phone: "555-0100",
                    tags: ["VIP"],
                    operationalNotes: "Prefers morning slots",
                    totalSpentCents: 0, // tests dynamic calculation fallback
                    completedAppointmentsCount: 0,
                    cancelledCount: 0,
                    noShowCount: 0,
                    consentMarketing: true,
                    consentMarketingAt: new Date("2026-01-01"),
                    consentSource: "PORTAL",
                    createdAt: new Date("2026-01-01"),
                    appointments: [
                        {
                            id: "appt_1",
                            startAt: new Date("2026-02-01"),
                            status: "COMPLETED",
                            priceCents: 15000,
                            paymentRecords: [
                                {
                                    amountCents: 15000,
                                    status: "SUCCEEDED",
                                    refunds: [],
                                },
                            ],
                        },
                    ],
                    user: {
                        id: "user_alice",
                        email: "alice@example.com",
                        emailVerifiedAt: new Date("2026-01-01"),
                        accountType: "CUSTOMER",
                    },
                },
            ];

            prisma.customer.findMany.mockResolvedValue(mockDbCustomers);
            prisma.customerInvitation.findMany.mockResolvedValue([]);

            const result = await service.listCustomers(mockOrgId);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("cust_1");
            expect(result[0].totalSpentCents).toBe(15000); // dynamically computed from payment record
            expect(result[0].completedAppointmentsCount).toBe(1);
            expect(result[0].user).toBeDefined();
            expect(result[0].user?.id).toBe("user_alice");
        });

        it("should correctly convert Stripe USD payments to organization native currency", async () => {
            prisma.organization.findUnique.mockResolvedValue({ currency: "PKR" });
            const mockDbCustomers = [
                {
                    id: "cust_pkr",
                    organizationId: mockOrgId,
                    fullName: "Zainab Khan",
                    email: "zainab@example.com",
                    tags: [],
                    totalSpentCents: 0,
                    completedAppointmentsCount: 1,
                    cancelledCount: 0,
                    noShowCount: 0,
                    consentMarketing: true,
                    createdAt: new Date(),
                    appointments: [
                        {
                            id: "appt_pkr",
                            startAt: new Date(),
                            status: "COMPLETED",
                            priceCents: 278000,
                            paymentRecords: [
                                {
                                    amountCents: 1000, // $10.00 USD in Stripe
                                    currency: "USD",
                                    status: "SUCCEEDED",
                                    metadata: {
                                        originalCurrency: "PKR",
                                        originalAmountCents: 278000, // 2,780 PKR
                                        exchangeRate: 0.003597,
                                    },
                                    refunds: [],
                                },
                            ],
                        },
                    ],
                    user: null,
                },
            ];

            prisma.customer.findMany.mockResolvedValue(mockDbCustomers);
            prisma.customerInvitation.findMany.mockResolvedValue([]);

            const result = await service.listCustomers(mockOrgId);

            expect(result).toHaveLength(1);
            expect(result[0].currency).toBe("PKR");
            expect(result[0].totalSpentCents).toBe(278000); // 2,780 PKR, NOT $10.00 USD cents (1000)
        });

        it("should correlate pending invitation for unlinked customers", async () => {
            prisma.customer.findMany.mockResolvedValue([
                {
                    id: "cust_2",
                    organizationId: mockOrgId,
                    fullName: "Bob Jones",
                    email: "bob@example.com",
                    tags: [],
                    totalSpentCents: 0,
                    completedAppointmentsCount: 0,
                    cancelledCount: 0,
                    noShowCount: 0,
                    consentMarketing: false,
                    createdAt: new Date(),
                    appointments: [],
                    user: null,
                },
            ]);

            prisma.customerInvitation.findMany.mockResolvedValue([
                {
                    id: "inv_1",
                    email: "bob@example.com",
                    status: "PENDING",
                    expiresAt: new Date(Date.now() + 3600000),
                },
            ]);

            const result = await service.listCustomers(mockOrgId);

            expect(result[0].pendingInvitation).toBeDefined();
            expect(result[0].pendingInvitation?.id).toBe("inv_1");
        });
    });

    describe("createCustomer", () => {
        it("should reject duplicate email in the same organization", async () => {
            prisma.customer.findFirst.mockResolvedValue({ id: "cust_existing" });

            await expect(
                service.createCustomer(mockOrgId, mockStaffId, {
                    fullName: "Duplicate User",
                    email: "existing@example.com",
                })
            ).rejects.toThrow(ConflictException);
        });

        it("should create customer and auto-link user if account exists in platform", async () => {
            prisma.customer.findFirst.mockResolvedValue(null);
            prisma.user.findFirst.mockResolvedValue({ id: "user_linked_123" });
            prisma.customer.create.mockResolvedValue({
                id: "cust_new",
                organizationId: mockOrgId,
                userId: "user_linked_123",
                fullName: "Charlie Brown",
                email: "charlie@example.com",
                tags: ["New"],
            });

            const created = await service.createCustomer(mockOrgId, mockStaffId, {
                fullName: "Charlie Brown",
                email: "charlie@example.com",
                tags: ["New"],
            });

            expect(created.id).toBe("cust_new");
            expect(prisma.customer.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        userId: "user_linked_123",
                        organizationId: mockOrgId,
                        email: "charlie@example.com",
                    }),
                })
            );
            expect(prisma.auditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        action: "customer.created",
                        resourceId: "cust_new",
                    }),
                })
            );
        });
    });

    describe("deleteCustomer", () => {
        it("should block deletion if active appointments exist", async () => {
            prisma.customer.findFirst.mockResolvedValue({
                id: "cust_active",
                organizationId: mockOrgId,
                appointments: [{ id: "appt_active", status: "CONFIRMED" }],
            });

            await expect(
                service.deleteCustomer(mockOrgId, "cust_active", mockStaffId)
            ).rejects.toThrow(BadRequestException);
        });

        it("should delete customer when no active appointments exist", async () => {
            prisma.customer.findFirst.mockResolvedValue({
                id: "cust_inactive",
                organizationId: mockOrgId,
                fullName: "Dan Inactive",
                email: "dan@example.com",
                appointments: [],
            });

            const res = await service.deleteCustomer(mockOrgId, "cust_inactive", mockStaffId);

            expect(res.success).toBe(true);
            expect(prisma.customer.delete).toHaveBeenCalledWith({
                where: { id: "cust_inactive" },
            });
            expect(prisma.auditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ action: "customer.deleted" }),
                })
            );
        });
    });

    describe("manageCustomerTag", () => {
        it("should add a tag without duplicates and remove cleanly", async () => {
            prisma.customer.findFirst.mockResolvedValue({
                id: "cust_tag",
                organizationId: mockOrgId,
                tags: ["VIP"],
            });
            prisma.customer.update.mockResolvedValue({
                id: "cust_tag",
                tags: ["VIP", "HighSpend"],
            });

            await service.manageCustomerTag(mockOrgId, "cust_tag", mockStaffId, "HighSpend", "add");
            expect(prisma.customer.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ tags: ["VIP", "HighSpend"] }),
                })
            );

            prisma.customer.findFirst.mockResolvedValue({
                id: "cust_tag",
                organizationId: mockOrgId,
                tags: ["VIP", "HighSpend"],
            });
            await service.manageCustomerTag(mockOrgId, "cust_tag", mockStaffId, "VIP", "remove");
            expect(prisma.customer.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ tags: ["HighSpend"] }),
                })
            );
        });
    });

    describe("AI Actor Privacy Sanitization", () => {
        it("should strip confidential notes and operational notes when isAiActor is true", async () => {
            prisma.customer.findFirst.mockResolvedValue({
                id: "cust_ai",
                organizationId: mockOrgId,
                fullName: "Emma Stone",
                email: "emma@example.com",
                tags: [],
                operationalNotes: "Customer has sensitive skin",
                totalSpentCents: 5000,
                completedAppointmentsCount: 1,
                cancelledCount: 0,
                noShowCount: 0,
                consentMarketing: true,
                createdAt: new Date(),
                appointments: [],
                notes: [
                    {
                        id: "note_1",
                        authorId: "staff_1",
                        noteText: "Confidential: staff VIP protocol applies",
                        isInternal: true,
                        createdAt: new Date(),
                    },
                ],
                user: null,
                waitlistEntries: [],
                reviews: [],
            });

            const staffView = await service.getCustomerDetails(mockOrgId, "cust_ai", false);
            expect(staffView.notes).toHaveLength(1);
            expect(staffView.operationalNotes).toBe("Customer has sensitive skin");

            const aiView = await service.getCustomerDetails(mockOrgId, "cust_ai", true);
            expect(aiView.notes).toHaveLength(0);
            expect(aiView.operationalNotes).toBeUndefined();
        });
    });
});
