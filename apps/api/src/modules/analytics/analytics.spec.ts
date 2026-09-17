import { AnalyticsRebuildService } from "./analytics-rebuild.service";
import { AnalyticsAggregatorService } from "./analytics-aggregator.service";

describe("Analytics Module — P12 Idempotent Read Models & Currency Safety", () => {
    let rebuildService: AnalyticsRebuildService;
    let aggregatorService: AnalyticsAggregatorService;
    let mockPrisma: any;

    beforeEach(() => {
        mockPrisma = {
            organization: {
                findUnique: jest.fn().mockResolvedValue({ id: "org-1", currency: "USD" }),
            },
            appointment: {
                findMany: jest.fn(),
            },
            paymentRecord: {
                findMany: jest.fn(),
            },
            refundRecord: {
                findMany: jest.fn(),
            },
            waitlistOffer: {
                findMany: jest.fn(),
            },
            waitlistEntry: {
                findMany: jest.fn(),
            },
            staffProfile: {
                findMany: jest.fn(),
            },
            service: {
                findMany: jest.fn(),
            },
            location: {
                findMany: jest.fn(),
            },
            googleCalendarConnection: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            orgDailyMetric: {
                findMany: jest.fn(),
                upsert: jest.fn(),
            },
            locationDailyMetric: {
                findMany: jest.fn(),
                upsert: jest.fn(),
            },
            staffDailyMetric: {
                findMany: jest.fn(),
                upsert: jest.fn(),
            },
            serviceDailyMetric: {
                findMany: jest.fn(),
                upsert: jest.fn(),
            },
            waitlistDailyMetric: {
                findMany: jest.fn(),
                upsert: jest.fn(),
            },
        };

        const mockExchangeRateService: any = {
            getRates: jest.fn().mockResolvedValue({
                USD: 1.0,
                PKR: 278.0,
                EUR: 0.92,
                GBP: 0.78,
            }),
            convertCurrency: jest.fn().mockImplementation((amountCents, from, to) => {
                const rates: any = { USD: 1.0, PKR: 278.0, EUR: 0.92, GBP: 0.78 };
                const fromRate = from === "USD" ? 1.0 : rates[from] || 1.0;
                const toRate = to === "USD" ? 1.0 : rates[to] || 1.0;
                return { convertedAmountCents: Math.round(amountCents * (toRate / fromRate)), rate: toRate / fromRate };
            }),
        };

        rebuildService = new AnalyticsRebuildService(mockPrisma);
        aggregatorService = new AnalyticsAggregatorService(mockPrisma, mockExchangeRateService);
    });

    it("idempotently rebuilds daily metrics with strict currency separation", async () => {
        const testDate = new Date("2026-08-27T10:00:00.000Z");

        // Fixtures with mixed USD and GBP transactions
        mockPrisma.appointment.findMany.mockResolvedValue([
            {
                id: "a1",
                organizationId: "org-1",
                locationId: "loc-1",
                staffId: "st-1",
                serviceId: "s-1",
                startAt: testDate,
                endAt: new Date("2026-08-27T11:00:00.000Z"),
                priceCents: 10000,
                currency: "USD",
                status: "COMPLETED",
                bookingSource: "CUSTOMER_WEB",
                recoveredRevenueCents: 0,
                service: { durationMin: 60 },
            },
            {
                id: "a2",
                organizationId: "org-1",
                locationId: "loc-1",
                staffId: "st-1",
                serviceId: "s-1",
                startAt: testDate,
                endAt: new Date("2026-08-27T11:30:00.000Z"),
                priceCents: 8500,
                currency: "GBP",
                status: "COMPLETED",
                bookingSource: "WAITLIST",
                recoveredRevenueCents: 8500,
                service: { durationMin: 90 },
            },
        ]);

        mockPrisma.paymentRecord.findMany.mockResolvedValue([
            {
                id: "p1",
                organizationId: "org-1",
                amountCents: 10000,
                currency: "USD",
                status: "SUCCEEDED",
                createdAt: testDate,
            },
            {
                id: "p2",
                organizationId: "org-1",
                amountCents: 8500,
                currency: "GBP",
                status: "SUCCEEDED",
                createdAt: testDate,
            },
        ]);

        mockPrisma.refundRecord.findMany.mockResolvedValue([]);
        mockPrisma.waitlistOffer.findMany.mockResolvedValue([
            { id: "wo1", organizationId: "org-1", status: "ACCEPTED", createdAt: testDate },
        ]);
        mockPrisma.waitlistEntry.findMany.mockResolvedValue([]);
        mockPrisma.staffProfile.findMany.mockResolvedValue([
            { id: "st-1", staffLocations: [], availabilities: [], breaks: [], leaves: [] },
        ]);

        const result = await rebuildService.rebuildMetrics("org-1", {
            startDate: "2026-08-27",
            endDate: "2026-08-27",
        });

        expect(result.status).toBe("COMPLETED");
        expect(result.processedDaysCount).toBe(1);

        // Verify that separate upserts occurred for USD and GBP (never summed into a single currency)
        const orgUpsertCalls = mockPrisma.orgDailyMetric.upsert.mock.calls;
        expect(orgUpsertCalls.length).toBeGreaterThanOrEqual(2);

        const usdCall = orgUpsertCalls.find((c: any) => c[0].where.organizationId_date_currency.currency === "USD");
        const gbpCall = orgUpsertCalls.find((c: any) => c[0].where.organizationId_date_currency.currency === "GBP");

        expect(usdCall).toBeDefined();
        expect(usdCall[0].create.bookedRevenueCents).toBe(10000);
        expect(usdCall[0].create.collectedRevenueCents).toBe(10000);

        expect(gbpCall).toBeDefined();
        expect(gbpCall[0].create.bookedRevenueCents).toBe(8500);
        expect(gbpCall[0].create.collectedRevenueCents).toBe(8500);
        expect(gbpCall[0].create.recoveredWaitlistRevenueCents).toBe(8500);
    });

    it("correctly computes utilization rate from productive booked minutes", async () => {
        const testDate = new Date("2026-08-27T09:00:00.000Z");

        mockPrisma.appointment.findMany.mockResolvedValue([
            {
                id: "a1",
                organizationId: "org-1",
                locationId: "loc-1",
                staffId: "st-1",
                serviceId: "s-1",
                startAt: testDate,
                endAt: new Date("2026-08-27T13:00:00.000Z"), // 4 hours = 240 min
                priceCents: 20000,
                currency: "USD",
                status: "CONFIRMED",
                bookingSource: "CUSTOMER_WEB",
                recoveredRevenueCents: 0,
                service: { durationMin: 240 },
            },
        ]);

        mockPrisma.paymentRecord.findMany.mockResolvedValue([]);
        mockPrisma.refundRecord.findMany.mockResolvedValue([]);
        mockPrisma.waitlistOffer.findMany.mockResolvedValue([]);
        mockPrisma.waitlistEntry.findMany.mockResolvedValue([]);
        mockPrisma.staffProfile.findMany.mockResolvedValue([
            { id: "st-1", staffLocations: [], availabilities: [], breaks: [], leaves: [] }, // 1 staff = 480 available min
        ]);

        await rebuildService.rebuildMetrics("org-1", {
            startDate: "2026-08-27",
            endDate: "2026-08-27",
        });

        const orgUpsert = mockPrisma.orgDailyMetric.upsert.mock.calls.find(
            (c: any) => c[0].where.organizationId_date_currency.currency === "USD"
        );

        expect(orgUpsert).toBeDefined();
        expect(orgUpsert[0].create.totalBookedMinutes).toBe(240);
        expect(orgUpsert[0].create.totalAvailableMinutes).toBe(480);
        // 240 / 480 = 50%
        expect(orgUpsert[0].create.utilizationRate).toBe(50);
    });

    it("authoritatively converts USD Stripe payments to organization currency (PKR)", async () => {
        const testDate = new Date("2026-08-27T10:00:00.000Z");

        mockPrisma.organization.findUnique.mockResolvedValue({
            id: "org-1",
            currency: "PKR",
            timezone: "UTC",
        });

        mockPrisma.appointment.findMany.mockResolvedValue([
            {
                id: "a1",
                organizationId: "org-1",
                customerId: "c1",
                priceCents: 5000, // 50 USD cents
                currency: "USD",
                status: "COMPLETED",
                startAt: testDate,
                endAt: new Date("2026-08-27T11:00:00.000Z"),
                recoveredRevenueCents: 0,
            },
        ]);

        mockPrisma.paymentRecord.findMany.mockResolvedValue([
            {
                id: "p1",
                organizationId: "org-1",
                amountCents: 5000, // $50 USD
                currency: "USD",
                status: "SUCCEEDED",
                createdAt: testDate,
            },
        ]);

        mockPrisma.refundRecord.findMany.mockResolvedValue([]);
        mockPrisma.staffProfile.findMany.mockResolvedValue([
            { id: "st-1", displayName: "Dr. Smith", archivedAt: null, availabilities: [] },
        ]);

        const overview = await aggregatorService.getDashboardOverview("org-1", {
            currency: "PKR",
            startDate: "2026-08-27",
            endDate: "2026-08-27",
        });

        expect(overview.period.currency).toBe("PKR");
        // $50 USD * 278 = 13,900 PKR (1,390,000 cents)
        expect(overview.kpis.totalCollectedRevenueCents).toBe(1390000);
        expect(overview.kpis.totalBookedRevenueCents).toBe(1390000);
        expect(overview.kpis.totalBookings).toBe(1);
        expect(overview.kpis.completedBookings).toBe(1);
        expect(overview.statusBreakdown?.completed).toBe(1);
        expect(overview.chartSeries.dates).toContain("2026-08-27");
    });
});

