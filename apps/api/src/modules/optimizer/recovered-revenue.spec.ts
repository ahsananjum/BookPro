import { RecoveredRevenueService } from "./recovered-revenue.service";

describe("RecoveredRevenueService", () => {
    let service: RecoveredRevenueService;
    let mockPrisma: any;

    beforeEach(() => {
        mockPrisma = {
            appointment: {
                update: jest.fn(),
                findMany: jest.fn(),
            },
            scheduleInsight: {
                findMany: jest.fn(),
            },
        };
        service = new RecoveredRevenueService(mockPrisma);
    });

    it("attributes recovered revenue to finalized appointment", async () => {
        mockPrisma.appointment.update.mockResolvedValue({ id: "appt-1", recoveredRevenueCents: 15000 });

        await service.attributeRecoveredRevenue("org-1", "appt-1", 15000);
        expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
            where: { id: "appt-1" },
            data: { recoveredRevenueCents: 15000 },
        });
    });

    it("aggregates recovered revenue KPIs and potential opportunity revenue", async () => {
        mockPrisma.appointment.findMany.mockResolvedValue([
            { recoveredRevenueCents: 15000 },
            { recoveredRevenueCents: 25000 },
        ]);
        mockPrisma.scheduleInsight.findMany.mockResolvedValue([
            { potentialRevenueCents: 10000 },
            { potentialRevenueCents: 20000 },
            { potentialRevenueCents: 30000 },
        ]);

        const stats = await service.getRecoveredRevenueStats("org-1");
        expect(stats.totalRecoveredRevenueCents).toBe(40000);
        expect(stats.recoveredBookingsCount).toBe(2);
        expect(stats.averageRecoveredBookingCents).toBe(20000);
        expect(stats.activeOpportunitiesCount).toBe(3);
        expect(stats.potentialRevenueCents).toBe(60000);
    });
});
