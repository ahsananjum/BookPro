import { NoShowSignalService } from "./no-show-signal.service";

describe("NoShowSignalService", () => {
    let service: NoShowSignalService;
    let mockPrisma: any;

    beforeEach(() => {
        mockPrisma = {
            organization: {
                findUnique: jest.fn(),
            },
            customer: {
                findUnique: jest.fn(),
            },
        };
        service = new NoShowSignalService(mockPrisma);
    });

    it("returns low risk default when noShowSignalEnabled is false on organization", async () => {
        mockPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", noShowSignalEnabled: false });
        mockPrisma.customer.findUnique.mockResolvedValue({
            id: "cust-1",
            totalSpentCents: 10000,
            completedAppointmentsCount: 5,
            appointments: [{ status: "NO_SHOW" }],
        });

        const result = await service.calculateCustomerRiskSignal("org-1", "cust-1");
        expect(result.riskLevel).toBe("LOW");
        expect(result.riskScore).toBe(0);
        expect(result.explanation).toContain("disabled by organization policy");
        expect(result.permittedFactorsOnly).toBe(true);
    });

    it("evaluates HIGH risk for customers with multiple past no-shows and unconfirmed appointment", async () => {
        mockPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", noShowSignalEnabled: true });
        mockPrisma.customer.findUnique.mockResolvedValue({
            id: "cust-1",
            totalSpentCents: 0,
            completedAppointmentsCount: 1,
            appointments: [
                { status: "NO_SHOW" },
                { status: "NO_SHOW" },
            ],
        });

        const result = await service.calculateCustomerRiskSignal("org-1", "cust-1", {
            isConfirmed: false,
            isDepositPaid: false,
            leadTimeHours: 72,
        });

        expect(result.riskLevel).toBe("HIGH");
        expect(result.riskScore).toBeGreaterThanOrEqual(60);
        expect(result.factors.noShowCount).toBe(2);
        expect(result.explanation).toContain("previous no-shows");
    });

    it("evaluates LOW risk for customers with positive attendance history", async () => {
        mockPrisma.organization.findUnique.mockResolvedValue({ id: "org-1", noShowSignalEnabled: true });
        mockPrisma.customer.findUnique.mockResolvedValue({
            id: "cust-1",
            totalSpentCents: 50000,
            completedAppointmentsCount: 8,
            appointments: [
                { status: "COMPLETED" },
                { status: "COMPLETED" },
                { status: "COMPLETED" },
            ],
        });

        const result = await service.calculateCustomerRiskSignal("org-1", "cust-1", {
            isConfirmed: true,
            isDepositPaid: true,
            leadTimeHours: 12,
        });

        expect(result.riskLevel).toBe("LOW");
        expect(result.riskScore).toBeLessThan(35);
        expect(result.factors.noShowCount).toBe(0);
        expect(result.explanation).toContain("proven positive attendance record");
    });
});
