import { ActorType, PermissionKey } from "@bookpro/contracts";
import { AIToolRegistryService, TrustedAIContext } from "../src/modules/ai/ai-tool-registry.service";
import { ForbiddenException } from "@nestjs/common";

describe("Strict Bidirectional AI Role Isolation Matrix", () => {
  let registry: AIToolRegistryService;
  let customerCtx: TrustedAIContext;
  let staffCtx: TrustedAIContext;

  beforeEach(() => {
    const mockPrisma: any = {
      aIToolExecution: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: "exec-1", ...args.data })),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: "exec-1", ...args.data })),
      },
    };

    registry = new AIToolRegistryService(
      mockPrisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { getDashboardOverview: jest.fn().mockResolvedValue({ kpis: { todayRevenueCents: 15000 } }) } as any,
      { listCustomers: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      { scanAndDetectGaps: jest.fn().mockResolvedValue([]) } as any,
      { getInsights: jest.fn().mockResolvedValue([]) } as any,
      { getRecoveredRevenueStats: jest.fn().mockResolvedValue({ totalRecoveredRevenueCents: 5000 }) } as any,
      { getOverviewStats: jest.fn().mockResolvedValue({ totalSubscribers: 42 }) } as any,
      { getCommissionSummary: jest.fn().mockResolvedValue({ totalAccruedCents: 2000 }), listCommissionLedger: jest.fn().mockResolvedValue([]) } as any,
    );

    customerCtx = {
      organizationId: "11111111-1111-1111-1111-111111111111",
      participantId: "cust-1",
      customerId: "cust-1",
      actorType: ActorType.CUSTOMER,
      subjectId: "user-cust-1",
      permissions: [],
      correlationId: "corr-test-1",
    };

    staffCtx = {
      organizationId: "11111111-1111-1111-1111-111111111111",
      participantId: "staff-1",
      actorType: ActorType.STAFF,
      subjectId: "user-staff-1",
      permissions: [
        PermissionKey.APPOINTMENT_READ,
        PermissionKey.APPOINTMENT_CREATE,
        PermissionKey.APPOINTMENT_MUTATE,
        PermissionKey.METRIC_VIEW,
      ],
      correlationId: "corr-test-2",
    };
  });

  describe("Customer Boundary Enforcement (Deny Owner Tools)", () => {
    it("should reject customer calling getBusinessOverview with CROSS_ROLE_TOOL_DENIED", async () => {
      await expect(
        registry.execute("conv-1", "getBusinessOverview", { period: "today" }, customerCtx, "idemp-1")
      ).rejects.toThrow(ForbiddenException);

      try {
        await registry.execute("conv-1", "getBusinessOverview", { period: "today" }, customerCtx, "idemp-1");
      } catch (err: any) {
        expect((err.getResponse() as any)?.code).toBe("CROSS_ROLE_TOOL_DENIED");
      }
    });

    it("should reject customer calling getAppointmentsAgenda with CROSS_ROLE_TOOL_DENIED", async () => {
      await expect(
        registry.execute("conv-1", "getAppointmentsAgenda", {}, customerCtx, "idemp-2")
      ).rejects.toThrow(ForbiddenException);

      try {
        await registry.execute("conv-1", "getAppointmentsAgenda", {}, customerCtx, "idemp-2");
      } catch (err: any) {
        expect((err.getResponse() as any)?.code).toBe("CROSS_ROLE_TOOL_DENIED");
      }
    });

    it("should reject customer calling getMarketingTelemetry with CROSS_ROLE_TOOL_DENIED", async () => {
      await expect(
        registry.execute("conv-1", "getMarketingTelemetry", {}, customerCtx, "idemp-3")
      ).rejects.toThrow(ForbiddenException);

      try {
        await registry.execute("conv-1", "getMarketingTelemetry", {}, customerCtx, "idemp-3");
      } catch (err: any) {
        expect((err.getResponse() as any)?.code).toBe("CROSS_ROLE_TOOL_DENIED");
      }
    });

    it("should reject customer calling getCommissionsReport with CROSS_ROLE_TOOL_DENIED", async () => {
      await expect(
        registry.execute("conv-1", "getCommissionsReport", {}, customerCtx, "idemp-4")
      ).rejects.toThrow(ForbiddenException);

      try {
        await registry.execute("conv-1", "getCommissionsReport", {}, customerCtx, "idemp-4");
      } catch (err: any) {
        expect((err.getResponse() as any)?.code).toBe("CROSS_ROLE_TOOL_DENIED");
      }
    });
  });

  describe("Staff Boundary Enforcement (Deny Consumer Checkout Tools)", () => {
    it("should reject staff calling createBookingHold with CROSS_ROLE_TOOL_DENIED", async () => {
      await expect(
        registry.execute(
          "conv-2",
          "createBookingHold",
          {
            serviceId: "22222222-2222-2222-2222-222222222222",
            startAt: new Date().toISOString(),
            endAt: new Date(Date.now() + 3600000).toISOString(),
          },
          staffCtx,
          "idemp-5"
        )
      ).rejects.toThrow(ForbiddenException);

      try {
        await registry.execute(
          "conv-2",
          "createBookingHold",
          {
            serviceId: "22222222-2222-2222-2222-222222222222",
            startAt: new Date().toISOString(),
            endAt: new Date(Date.now() + 3600000).toISOString(),
          },
          staffCtx,
          "idemp-5"
        );
      } catch (err: any) {
        expect((err.getResponse() as any)?.code).toBe("CROSS_ROLE_TOOL_DENIED");
      }
    });

    it("should reject staff calling getMyBillingHistory with CROSS_ROLE_TOOL_DENIED", async () => {
      await expect(
        registry.execute("conv-2", "getMyBillingHistory", {}, staffCtx, "idemp-6")
      ).rejects.toThrow(ForbiddenException);

      try {
        await registry.execute("conv-2", "getMyBillingHistory", {}, staffCtx, "idemp-6");
      } catch (err: any) {
        expect((err.getResponse() as any)?.code).toBe("CROSS_ROLE_TOOL_DENIED");
      }
    });
  });

  describe("Staff Authorized Operations", () => {
    it("should allow staff to query getBusinessOverview and return BUSINESS_OVERVIEW card", async () => {
      const result = await registry.execute(
        "conv-2",
        "getBusinessOverview",
        { period: "today" },
        staffCtx,
        "idemp-7"
      );
      expect(result.card.kind).toBe("BUSINESS_OVERVIEW");
      expect(result.card.title).toBe("Executive Dashboard Overview");
    });

    it("should allow staff to query getMarketingTelemetry and return MARKETING_OVERVIEW card", async () => {
      const result = await registry.execute(
        "conv-2",
        "getMarketingTelemetry",
        {},
        staffCtx,
        "idemp-8"
      );
      expect(result.card.kind).toBe("MARKETING_OVERVIEW");
      expect(result.card.title).toBe("Marketing & Audience Telemetry");
    });
  });
});
