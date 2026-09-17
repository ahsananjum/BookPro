import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import {
    AttendanceQueryInput,
    AttendanceStatus,
    ManagerCorrectAttendanceInput,
    StaffAttendanceDto,
    StaffCheckInInput,
    StaffCheckOutInput,
} from "@bookpro/contracts";

@Injectable()
export class StaffAttendanceService {
    private readonly logger = new Logger(StaffAttendanceService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Records staff member clock-in, evaluates lateness against shift schedule.
     */
    async clockIn(
        organizationId: string,
        staffId: string,
        input: StaffCheckInInput = {}
    ): Promise<StaffAttendanceDto> {
        const staff = await this.prisma.staffProfile.findFirst({
            where: { id: staffId, organizationId },
            include: { availabilities: true },
        });

        if (!staff) {
            throw new NotFoundException(`Staff profile ${staffId} not found.`);
        }

        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const shiftDate = new Date(`${todayStr}T00:00:00.000Z`);

        // Check if already clocked in today
        const existing = await this.prisma.staffAttendance.findFirst({
            where: {
                organizationId,
                staffId,
                shiftDate,
            },
        });

        if (existing && !existing.checkOutAt) {
            return this.toDto(existing, staff.displayName);
        }

        // Determine scheduled shift start for day of week (0=SUN..6=SAT)
        const dayOfWeek = now.getUTCDay();
        const availability = staff.availabilities.find((a) => a.dayOfWeek === dayOfWeek);

        let latenessMinutes = 0;
        let status: AttendanceStatus = "ON_TIME";

        if (availability && availability.startTime) {
            // parse HH:mm
            const [hours, minutes] = availability.startTime.split(":").map(Number);
            const shiftStartTime = new Date(shiftDate);
            shiftStartTime.setUTCHours(hours, minutes, 0, 0);

            const diffMinutes = Math.round((now.getTime() - shiftStartTime.getTime()) / 60000);
            if (diffMinutes > 5) {
                latenessMinutes = diffMinutes;
                status = "LATE";
            }
        }

        const locationId = input.locationId || null;

        const record = await this.prisma.staffAttendance.create({
            data: {
                organizationId,
                staffId,
                locationId,
                shiftDate,
                checkInAt: now,
                status,
                latenessMinutes,
                managerNotes: input.notes || null,
            },
            include: { staff: true, location: true },
        });

        this.logger.log(`[StaffAttendance] Staff ${staff.displayName} clocked in (status: ${status}, lateness: ${latenessMinutes}m)`);

        return this.toDto(record);
    }

    /**
     * Records staff member clock-out.
     */
    async clockOut(
        organizationId: string,
        staffId: string,
        input: StaffCheckOutInput = {}
    ): Promise<StaffAttendanceDto> {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const shiftDate = new Date(`${todayStr}T00:00:00.000Z`);

        const activeRecord = await this.prisma.staffAttendance.findFirst({
            where: {
                organizationId,
                staffId,
                shiftDate,
                checkOutAt: null,
            },
            orderBy: { checkInAt: "desc" },
            include: { staff: true, location: true },
        });

        if (!activeRecord) {
            throw new BadRequestException("No active check-in record found to clock out.");
        }

        const updated = await this.prisma.staffAttendance.update({
            where: { id: activeRecord.id },
            data: {
                checkOutAt: now,
                ...(input.notes ? { managerNotes: `${activeRecord.managerNotes || ""}\nCheckout note: ${input.notes}`.trim() } : {}),
            },
            include: { staff: true, location: true },
        });

        this.logger.log(`[StaffAttendance] Staff ${activeRecord.staff?.displayName} clocked out at ${now.toISOString()}`);

        return this.toDto(updated);
    }

    /**
     * Manager adjustment of attendance records with strict audit logging.
     */
    async managerCorrection(
        organizationId: string,
        attendanceId: string,
        managerUserId: string,
        input: ManagerCorrectAttendanceInput
    ): Promise<StaffAttendanceDto> {
        const record = await this.prisma.staffAttendance.findFirst({
            where: { id: attendanceId, organizationId },
            include: { staff: true, location: true },
        });

        if (!record) {
            throw new NotFoundException(`Attendance record ${attendanceId} not found.`);
        }

        const checkInAt = input.checkInAt ? new Date(input.checkInAt) : record.checkInAt;
        const checkOutAt = input.checkOutAt ? new Date(input.checkOutAt) : record.checkOutAt;
        const status: AttendanceStatus = input.status || "CORRECTED";

        const updated = await this.prisma.staffAttendance.update({
            where: { id: attendanceId },
            data: {
                checkInAt,
                checkOutAt,
                status,
                managerNotes: input.managerNotes,
                correctedBy: managerUserId,
                correctedAt: new Date(),
            },
            include: { staff: true, location: true },
        });

        // Write immutable audit log
        await this.prisma.auditLog.create({
            data: {
                organizationId,
                actorType: "USER",
                actorId: managerUserId,
                action: "attendance.manager_corrected",
                resourceType: "staff_attendance",
                resourceId: attendanceId,
                payload: {
                    before: { checkInAt: record.checkInAt, checkOutAt: record.checkOutAt, status: record.status },
                    after: { checkInAt, checkOutAt, status },
                    notes: input.managerNotes,
                },
            },
        });

        return this.toDto(updated);
    }

    /**
     * Lists attendance records for reporting and staff view.
     */
    async listAttendance(
        organizationId: string,
        query: AttendanceQueryInput = {}
    ): Promise<StaffAttendanceDto[]> {
        const where: any = { organizationId };

        if (query.staffId) {
            where.staffId = query.staffId;
        }
        if (query.locationId) {
            where.locationId = query.locationId;
        }
        if (query.startDate || query.endDate) {
            where.shiftDate = {};
            if (query.startDate) {
                where.shiftDate.gte = new Date(`${query.startDate}T00:00:00.000Z`);
            }
            if (query.endDate) {
                where.shiftDate.lte = new Date(`${query.endDate}T23:59:59.999Z`);
            }
        }

        const records = await this.prisma.staffAttendance.findMany({
            where,
            include: { staff: true, location: true },
            orderBy: { checkInAt: "desc" },
            take: 100,
        });

        return records.map((r) => this.toDto(r));
    }

    private toDto(record: any, fallbackName?: string): StaffAttendanceDto {
        return {
            id: record.id,
            organizationId: record.organizationId,
            staffId: record.staffId,
            staffName: record.staff?.displayName || fallbackName || "Staff Member",
            locationId: record.locationId,
            locationName: record.location?.name || null,
            shiftDate: record.shiftDate.toISOString().slice(0, 10),
            checkInAt: record.checkInAt.toISOString(),
            checkOutAt: record.checkOutAt ? record.checkOutAt.toISOString() : null,
            status: record.status,
            latenessMinutes: record.latenessMinutes,
            managerNotes: record.managerNotes,
            correctedBy: record.correctedBy,
            correctedAt: record.correctedAt ? record.correctedAt.toISOString() : null,
            createdAt: record.createdAt.toISOString(),
            updatedAt: record.updatedAt.toISOString(),
        };
    }
}
