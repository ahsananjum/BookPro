import { DataExportService } from "./data-export.service";

describe("DataExportService — CSV Reports & Tenant Isolation", () => {
    let service: DataExportService;
    let mockPrisma: any;

    beforeEach(() => {
        mockPrisma = {
            dataExport: {
                create: jest.fn(),
                update: jest.fn(),
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            customer: {
                findMany: jest.fn(),
            },
            appointment: {
                findMany: jest.fn(),
            },
            paymentRecord: {
                findMany: jest.fn(),
            },
            orgDailyMetric: {
                findMany: jest.fn(),
            },
        };

        service = new DataExportService(mockPrisma);
    });

    it("generates a CSV customer export isolated to the requesting tenant", async () => {
        mockPrisma.customer.findMany.mockResolvedValue([
            {
                id: "c1",
                organizationId: "org-1",
                fullName: "Sophia Bennett",
                email: "sophia@example.com",
                phone: "+1555123456",
                totalSpentCents: 45000,
                completedAppointmentsCount: 4,
                cancelledCount: 0,
                noShowCount: 0,
                createdAt: new Date("2026-08-01T10:00:00.000Z"),
            },
        ]);

        mockPrisma.dataExport.create.mockResolvedValue({
            id: "exp-1",
            organizationId: "org-1",
            requestedBy: "user-1",
            exportType: "CUSTOMERS",
            status: "PROCESSING",
        });

        mockPrisma.dataExport.update.mockResolvedValue({
            id: "exp-1",
            organizationId: "org-1",
            requestedBy: "user-1",
            exportType: "CUSTOMERS",
            status: "COMPLETED",
            fileUrl: "/api/v1/organizations/org-1/exports/exp-1/download",
            rowCount: 1,
            fileSizeBytes: 200,
            createdAt: new Date(),
            completedAt: new Date(),
        });

        const exportDto = await service.createExport("org-1", "user-1", {
            exportType: "CUSTOMERS",
        });

        expect(exportDto.status).toBe("COMPLETED");
        expect(exportDto.rowCount).toBe(1);
        expect(mockPrisma.customer.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { organizationId: "org-1" },
            })
        );
    });
});
