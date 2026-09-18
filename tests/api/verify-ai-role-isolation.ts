import { ActorType, PermissionKey, RequestContext } from "@bookpro/contracts";
import { AIToolRegistryService, TrustedAIContext } from "../src/modules/ai/ai-tool-registry.service";
import { ForbiddenException } from "@nestjs/common";

/**
 * Verification test for strict bidirectional role isolation between Customer and Owner AI.
 */
async function runVerification() {
  console.log("=================================================================");
  console.log("RUNNING STRICT BIDIRECTIONAL AI ROLE ISOLATION & TOOL TEST");
  console.log("=================================================================");

  // Mock Prisma and domain services for testing isolation rules
  const mockPrisma: any = {
    aIToolExecution: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: "exec-1", ...args.data })),
      update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: "exec-1", ...args.data })),
    },
  };

  const registry = new AIToolRegistryService(
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

  const customerCtx: TrustedAIContext = {
    organizationId: "11111111-1111-1111-1111-111111111111",
    participantId: "cust-1",
    customerId: "cust-1",
    actorType: ActorType.CUSTOMER,
    subjectId: "user-cust-1",
    permissions: [],
    correlationId: "corr-test-1",
  };

  const staffCtx: TrustedAIContext = {
    organizationId: "11111111-1111-1111-1111-111111111111",
    participantId: "staff-1",
    actorType: ActorType.STAFF,
    subjectId: "user-staff-1",
    permissions: [
      PermissionKey.APPOINTMENT_READ,
      PermissionKey.APPOINTMENT_CREATE,
      PermissionKey.APPOINTMENT_MUTATE,
      PermissionKey.ANALYTICS_READ,
    ],
    correlationId: "corr-test-2",
  };

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // TEST 1: Customer attempting to call Owner tool: getBusinessOverview
  try {
    await registry.execute("conv-1", "getBusinessOverview", { period: "today" }, customerCtx, "idemp-1");
    assert(false, "Customer should NOT be able to run getBusinessOverview");
  } catch (err: any) {
    const isDenied = err instanceof ForbiddenException && (err.getResponse() as any)?.code === "CROSS_ROLE_TOOL_DENIED";
    assert(isDenied, "Customer calling getBusinessOverview is rejected with CROSS_ROLE_TOOL_DENIED");
  }

  // TEST 2: Customer attempting to call Owner tool: getAppointmentsAgenda
  try {
    await registry.execute("conv-1", "getAppointmentsAgenda", {}, customerCtx, "idemp-2");
    assert(false, "Customer should NOT be able to run getAppointmentsAgenda");
  } catch (err: any) {
    const isDenied = err instanceof ForbiddenException && (err.getResponse() as any)?.code === "CROSS_ROLE_TOOL_DENIED";
    assert(isDenied, "Customer calling getAppointmentsAgenda is rejected with CROSS_ROLE_TOOL_DENIED");
  }

  // TEST 3: Customer attempting to call Owner tool: getMarketingTelemetry
  try {
    await registry.execute("conv-1", "getMarketingTelemetry", {}, customerCtx, "idemp-3");
    assert(false, "Customer should NOT be able to run getMarketingTelemetry");
  } catch (err: any) {
    const isDenied = err instanceof ForbiddenException && (err.getResponse() as any)?.code === "CROSS_ROLE_TOOL_DENIED";
    assert(isDenied, "Customer calling getMarketingTelemetry is rejected with CROSS_ROLE_TOOL_DENIED");
  }

  // TEST 4: Customer attempting to call Owner tool: getCommissionsReport
  try {
    await registry.execute("conv-1", "getCommissionsReport", {}, customerCtx, "idemp-4");
    assert(false, "Customer should NOT be able to run getCommissionsReport");
  } catch (err: any) {
    const isDenied = err instanceof ForbiddenException && (err.getResponse() as any)?.code === "CROSS_ROLE_TOOL_DENIED";
    assert(isDenied, "Customer calling getCommissionsReport is rejected with CROSS_ROLE_TOOL_DENIED");
  }

  // TEST 5: Staff attempting to call Customer checkout hold tool: createBookingHold
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
    assert(false, "Staff should NOT be able to run consumer checkout tool createBookingHold");
  } catch (err: any) {
    const isDenied = err instanceof ForbiddenException && (err.getResponse() as any)?.code === "CROSS_ROLE_TOOL_DENIED";
    assert(isDenied, "Staff calling createBookingHold is rejected with CROSS_ROLE_TOOL_DENIED");
  }

  // TEST 6: Staff attempting to call Customer tool: getMyBillingHistory
  try {
    await registry.execute("conv-2", "getMyBillingHistory", {}, staffCtx, "idemp-6");
    assert(false, "Staff should NOT be able to run consumer getMyBillingHistory");
  } catch (err: any) {
    const isDenied = err instanceof ForbiddenException && (err.getResponse() as any)?.code === "CROSS_ROLE_TOOL_DENIED";
    assert(isDenied, "Staff calling getMyBillingHistory is rejected with CROSS_ROLE_TOOL_DENIED");
  }

  // TEST 7: Staff executing allowed Owner tool: getBusinessOverview
  try {
    const result = await registry.execute("conv-2", "getBusinessOverview", { period: "today" }, staffCtx, "idemp-7");
    assert(result.card.kind === "BUSINESS_OVERVIEW", "Staff can successfully execute getBusinessOverview and receive BUSINESS_OVERVIEW card");
  } catch (err: any) {
    assert(false, `Staff should be allowed to run getBusinessOverview: ${err.message}`);
  }

  // TEST 8: Staff executing allowed Owner tool: getMarketingTelemetry
  try {
    const result = await registry.execute("conv-2", "getMarketingTelemetry", {}, staffCtx, "idemp-8");
    assert(result.card.kind === "MARKETING_OVERVIEW", "Staff can successfully execute getMarketingTelemetry and receive MARKETING_OVERVIEW card");
  } catch (err: any) {
    assert(false, `Staff should be allowed to run getMarketingTelemetry: ${err.message}`);
  }

  console.log("\n=================================================================");
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((e) => {
  console.error("Verification script error:", e);
  process.exit(1);
});
