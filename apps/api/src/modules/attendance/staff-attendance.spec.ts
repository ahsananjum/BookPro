import { StaffAttendanceService } from "./staff-attendance.service";
import { NotFoundException, BadRequestException } from "@nestjs/common";

describe("StaffAttendanceService — Check-In, Lateness & Manager Corrections", () => {
    let service: StaffAttendanceService;
    let mockPrisma: any;

    beforeEach(() => {
        mockPrisma = {
            staffProfile: {
                findFirst: jest.fn(),
            },
            staffAttendance: {
                findFirst: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                findMany: jest.fn(),
            },
            auditLog: {
                create: jest.fn(),
            },
        };

        service = new StaffAttendanceService(mockPrisma);
    });

    it("records staff clock-in as ON_TIME when within tolerance", async () => {
        const now = new Date();
        const dayOfWeek = now.getUTCDay();

        mockPrisma.staffProfile.findFirst.mockResolvedValue({
            id: "st-1",
            organizationId: "org-1",
            displayName: "Elena Rostova",
            availabilities: [
                {
                    dayOfWeek,
                    startTime: "00:00", // Start of day, so now is past start
                    endTime: "23:59",
                },
            ],
        });

        mockPrisma.staffAttendance.findFirst.mockResolvedValue(null);
        mockPrisma.staffAttendance.create.mockResolvedValue({
            id: "att-1",
            organizationId: "org-1",
            staffId: "st-1",
            shiftDate: new Date(),
            checkInAt: now,
            status: "ON_TIME",
            latenessMinutes: 0,
            createdAt: now,
            updatedAt: now,
            staff: { displayName: "Elena Rostova" },
            location: { name: "Downtown Salon" },
        });

        const record = await service.clockIn("org-1", "st-1");

        expect(record.staffId).toBe("st-1");
        expect(mockPrisma.staffAttendance.create).toHaveBeenCalledTimes(1);
    });

    it("records staff clock-out on active attendance session", async () => {
        const now = new Date();

        mockPrisma.staffAttendance.findFirst.mockResolvedValue({
            id: "att-active",
            organizationId: "org-1",
            staffId: "st-1",
            checkInAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
            checkOutAt: null,
            shiftDate: now,
            status: "ON_TIME",
            latenessMinutes: 0,
            createdAt: now,
            updatedAt: now,
            staff: { displayName: "Elena Rostova" },
            location: null,
        });

        mockPrisma.staffAttendance.update.mockResolvedValue({
            id: "att-active",
            organizationId: "org-1",
            staffId: "st-1",
            checkInAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
            checkOutAt: now,
            shiftDate: now,
            status: "ON_TIME",
            latenessMinutes: 0,
            createdAt: now,
            updatedAt: now,
            staff: { displayName: "Elena Rostova" },
            location: null,
        });

        const record = await service.clockOut("org-1", "st-1");

        expect(record.checkOutAt).toBeDefined();
        expect(mockPrisma.staffAttendance.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "att-active" },
                data: expect.objectContaining({ checkOutAt: expect.any(Date) }),
            })
        );
    });

    it("records manager correction with immutable audit log", async () => {
        const now = new Date();

        mockPrisma.staffAttendance.findFirst.mockResolvedValue({
            id: "att-10",
            organizationId: "org-1",
            staffId: "st-1",
            checkInAt: now,
            checkOutAt: null,
            status: "LATE",
            latenessMinutes: 15,
            shiftDate: now,
            createdAt: now,
            updatedAt: now,
            staff: { displayName: "Elena" },
            location: null,
        });

        mockPrisma.staffAttendance.update.mockResolvedValue({
            id: "att-10",
            organizationId: "org-1",
            staffId: "st-1",
            checkInAt: now,
            checkOutAt: null,
            status: "CORRECTED",
            latenessMinutes: 15,
            managerNotes: "Approved transit delay",
            correctedBy: "mgr-1",
            correctedAt: now,
            shiftDate: now,
            createdAt: now,
            updatedAt: now,
            staff: { displayName: "Elena" },
            location: null,
        });

        const updated = await service.managerCorrection("org-1", "att-10", "mgr-1", {
            status: "CORRECTED",
            managerNotes: "Approved transit delay",
        });

        expect(updated.status).toBe("CORRECTED");
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: "org-1",
                    actorType: "USER",
                    actorId: "mgr-1",
                    action: "attendance.manager_corrected",
                }),
            })
        );
    });
});
