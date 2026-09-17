import { DashboardOverviewService, getTimezoneDayBounds } from "./dashboard-overview.service";
import { NotFoundException } from "@nestjs/common";
import { AppointmentStatus, PaymentRecordStatus } from "@prisma/client";

describe("DashboardOverviewService", () => {
    let service: DashboardOverviewService;
    let mockPrisma: any;
    let mockOrgService: any;
    const orgId = "00000000-0000-0000-0000-000000000001";

    beforeEach(() => {
        mockPrisma = {
            organization: {
                findUnique: jest.fn(),
            },
            appointment: {
                findMany: jest.fn(),
            },
            paymentRecord: {
                findMany: jest.fn(),
            },
            googleCalendarConnection: {
                findMany: jest.fn(),
            },
            waitlistEntry: {
                count: jest.fn(),
            },
            orgDailyMetric: {
                findMany: jest.fn(),
            },
        };

        mockOrgService = {
            getOnboardingStatus: jest.fn(),
        };

        service = new DashboardOverviewService(mockPrisma, mockOrgService);
    });

    describe("Timezone Day Bounds Calculation", () => {
        it("should correctly compute day boundaries for UTC and non-UTC timezones", () => {
            const refDate = new Date("2026-08-28T10:00:00.000Z");

            const utcBounds = getTimezoneDayBounds("UTC", refDate);
            expect(utcBounds.dateStr).toBe("2026-08-28");
            expect(utcBounds.startOfDay.toISOString()).toBe("2026-08-28T00:00:00.000Z");

            const pktBounds = getTimezoneDayBounds("Asia/Karachi", refDate);
            expect(pktBounds.dateStr).toBe("2026-08-28");
            expect(pktBounds.startOfDay.toISOString()).toBe("2026-08-27T19:00:00.000Z");

            const nyBounds = getTimezoneDayBounds("America/New_York", refDate);
            expect(nyBounds.dateStr).toBe("2026-08-28");
            expect(nyBounds.startOfDay.toISOString()).toBe("2026-08-28T04:00:00.000Z");
        });
    });

    describe("getDashboardOverview", () => {
        it("should throw NotFoundException if organization does not exist", async () => {
            mockPrisma.organization.findUnique.mockResolvedValue(null);

            await expect(service.getDashboardOverview(orgId)).rejects.toThrow(NotFoundException);
        });

        it("should aggregate today's metrics, revenue, upcoming appointments and health alerts correctly", async () => {
            mockPrisma.organization.findUnique.mockResolvedValue({
                id: orgId,
                name: "Luma Studio",
                slug: "luma-studio",
                timezone: "Asia/Karachi",
                currency: "PKR",
                logoUrl: "https://example.com/logo.png",
                brandName: "Luma",
                primaryColor: "#0284c7",
                bookingEnabled: true,
                onboardingCompleted: true,
                paymentIntent: "ONLINE",
                stripeAccountId: "acct_123",
            });

            mockPrisma.appointment.findMany
                .mockResolvedValueOnce([
                    { id: "a1", status: AppointmentStatus.COMPLETED, priceCents: 500000 },
                    { id: "a2", status: AppointmentStatus.CONFIRMED, priceCents: 300000 },
                    { id: "a3", status: AppointmentStatus.CANCELLED, priceCents: 200000 },
                ])
                .mockResolvedValueOnce([
                    {
                        id: "a2",
                        startAt: new Date("2026-08-28T11:00:00.000Z"),
                        endAt: new Date("2026-08-28T12:00:00.000Z"),
                        status: AppointmentStatus.CONFIRMED,
                        priceCents: 300000,
                        currency: "PKR",
                        customer: { id: "c1", fullName: "Ayesha Malik", email: "ayesha@example.com", phone: "+923001234567" },
                        service: { id: "s1", name: "Balayage", durationMin: 60 },
                        staff: { id: "st1", displayName: "Sarah" },
                        location: { id: "loc1", name: "Main Branch" },
                        paymentRecords: [{ amountCents: 300000 }],
                    },
                ]);

            mockPrisma.paymentRecord.findMany.mockResolvedValue([
                { amountCents: 500000 },
                { amountCents: 300000 },
            ]);

            mockOrgService.getOnboardingStatus.mockResolvedValue({
                firstService: { id: "s1", name: "Balayage" },
                firstStaff: { id: "st1", displayName: "Sarah" },
                completedSteps: ["BUSINESS_DETAILS", "SERVICE", "STAFF", "AVAILABILITY", "PUBLISH"],
            });

            mockPrisma.googleCalendarConnection.findMany.mockResolvedValue([]);
            mockPrisma.waitlistEntry.count.mockResolvedValue(2);
            mockPrisma.orgDailyMetric.findMany
                .mockResolvedValueOnce([
                    { bookingCount: 15, collectedRevenueCents: 1500000, cancelledCount: 1, totalAvailableMinutes: 2000, totalBookedMinutes: 1400 },
                ])
                .mockResolvedValueOnce([
                    { bookingCount: 10, collectedRevenueCents: 1000000 },
                ]);

            const result = await service.getDashboardOverview(orgId);

            expect(result.organization.name).toBe("Luma Studio");
            expect(result.organization.bookingPage.status).toBe("PUBLISHED");
            expect(result.organization.bookingPage.url).toContain("luma-studio/book");

            // Today metrics
            expect(result.today.appointments.total).toBe(3);
            expect(result.today.appointments.completed).toBe(1);
            expect(result.today.appointments.upcoming).toBe(1);
            expect(result.today.collectedRevenueCents).toBe(800000);
            expect(result.today.expectedRevenueCents).toBe(800000); // 5000 + 3000 (cancelled excluded)
            expect(result.today.currency).toBe("PKR");

            // Upcoming list
            expect(result.upcomingAppointments.length).toBe(1);
            expect(result.upcomingAppointments[0].customer?.fullName).toBe("Ayesha Malik");
            expect(result.upcomingAppointments[0].paymentStatus).toBe("PAID");

            // Health
            expect(result.health.bookingReady).toBe(true);
            expect(result.health.issues.length).toBe(0);

            // Performance trends
            expect(result.performance.bookingsCount).toBe(15);
            expect(result.performance.bookingsVsPrev).toBe(50); // (15 - 10)/10 * 100
            expect(result.performance.revenueVsPrev).toBe(50);
            expect(result.performance.utilizationRate).toBe(70); // 1400 / 2000 * 100

            // Waitlist
            expect(result.waitlistOpportunity?.pendingCount).toBe(2);
        });

        it("should detect unpublished booking page and missing configuration as health issues", async () => {
            mockPrisma.organization.findUnique.mockResolvedValue({
                id: orgId,
                name: "Unconfigured Clinic",
                slug: "unconfigured-clinic",
                timezone: "UTC",
                currency: "USD",
                bookingEnabled: false,
                paymentIntent: "ONLINE",
                stripeAccountId: null,
            });

            mockPrisma.appointment.findMany.mockResolvedValue([]);
            mockPrisma.paymentRecord.findMany.mockResolvedValue([]);
            mockOrgService.getOnboardingStatus.mockResolvedValue({
                firstService: null,
                firstStaff: null,
                completedSteps: [],
            });
            mockPrisma.googleCalendarConnection.findMany.mockResolvedValue([{ id: "conn-1" }]);
            mockPrisma.waitlistEntry.count.mockResolvedValue(0);
            mockPrisma.orgDailyMetric.findMany.mockResolvedValue([]);

            const result = await service.getDashboardOverview(orgId);

            expect(result.organization.bookingPage.status).toBe("UNPUBLISHED");
            expect(result.health.bookingReady).toBe(false);

            const issueCodes = result.health.issues.map((i) => i.code);
            expect(issueCodes).toContain("BOOKING_UNPUBLISHED");
            expect(issueCodes).toContain("NO_ACTIVE_SERVICES");
            expect(issueCodes).toContain("NO_ACTIVE_STAFF");
            expect(issueCodes).toContain("NO_AVAILABILITY");
            expect(issueCodes).toContain("STRIPE_NOT_CONNECTED");
            expect(issueCodes).toContain("GOOGLE_CALENDAR_DEGRADED");
        });

        it("should convert appointments and payments to chosen target currency and include forex metadata", async () => {
            mockPrisma.organization.findUnique.mockResolvedValue({
                id: orgId,
                name: "Global Salon",
                slug: "global-salon",
                timezone: "UTC",
                currency: "USD",
                bookingEnabled: true,
                onboardingCompleted: true,
                paymentIntent: "ONLINE",
                stripeAccountId: "acct_global",
            });

            // 1 appointment booked in USD for $100.00 (10,000 cents)
            mockPrisma.appointment.findMany
                .mockResolvedValueOnce([
                    { id: "a1", status: AppointmentStatus.CONFIRMED, priceCents: 10000, currency: "USD" },
                ])
                .mockResolvedValueOnce([
                    {
                        id: "a1",
                        startAt: new Date(),
                        endAt: new Date(Date.now() + 3600000),
                        status: AppointmentStatus.CONFIRMED,
                        priceCents: 10000,
                        currency: "USD",
                        customer: { id: "c1", fullName: "John Doe", email: "john@example.com" },
                        service: { id: "s1", name: "Executive Cut", durationMin: 45 },
                        staff: { id: "st1", displayName: "Alex" },
                        location: { id: "loc1", name: "Downtown" },
                        paymentRecords: [{ amountCents: 10000, currency: "USD" }],
                    },
                ]);

            mockPrisma.paymentRecord.findMany.mockResolvedValue([
                { amountCents: 10000, currency: "USD" },
            ]);
            mockOrgService.getOnboardingStatus.mockResolvedValue({
                firstService: { id: "s1" },
                firstStaff: { id: "st1" },
                completedSteps: ["BUSINESS_DETAILS", "SERVICE", "STAFF", "AVAILABILITY", "PUBLISH"],
            });
            mockPrisma.googleCalendarConnection.findMany.mockResolvedValue([]);
            mockPrisma.waitlistEntry.count.mockResolvedValue(0);
            mockPrisma.orgDailyMetric.findMany.mockResolvedValue([]);

            // Request dashboard in EUR
            const result = await service.getDashboardOverview(orgId, undefined, "EUR");

            expect(result.today.currency).toBe("EUR");
            expect(result.forex).toBeDefined();
            expect(result.forex?.chosenCurrency).toBe("EUR");
            expect(result.forex?.exchangeRate).toBeGreaterThan(0);
            // $100 converted to EUR should be roughly around ~85-95 EUR depending on live rate
            expect(result.today.collectedRevenueCents).toBeGreaterThan(5000);
            expect(result.today.expectedRevenueCents).toBeGreaterThan(5000);
            expect(result.upcomingAppointments[0].currency).toBe("EUR");
            expect(result.upcomingAppointments[0].originalPriceCents).toBe(10000);
            expect(result.upcomingAppointments[0].originalCurrency).toBe("USD");
        });
    });
});
