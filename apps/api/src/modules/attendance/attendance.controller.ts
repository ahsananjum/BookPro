import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Query,
    Body,
    ForbiddenException,
    BadRequestException,
} from "@nestjs/common";
import { ReqContext, RequirePermissions } from "@bookpro/server-core";
import { RequestContext, PermissionKey } from "@bookpro/contracts";
import {
    staffCheckInSchema,
    staffCheckOutSchema,
    managerCorrectAttendanceSchema,
    attendanceQuerySchema,
} from "@bookpro/validation";
import { StaffAttendanceService } from "./staff-attendance.service";

@Controller("organizations/:orgId/staff/attendance")
export class AttendanceController {
    constructor(private readonly attendanceService: StaffAttendanceService) {}

    private resolveOrgId(ctx: RequestContext, paramOrgId: string): string {
        const organizationId = ctx.organizationId || paramOrgId;
        if (paramOrgId && ctx.organizationId && !ctx.isPlatformAdmin && ctx.organizationId !== paramOrgId) {
            throw new ForbiddenException("Tenant context mismatch.");
        }
        return organizationId;
    }

    @Post("check-in")
    @RequirePermissions(PermissionKey.ATTENDANCE_READ)
    async clockIn(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);

        const staffId = ctx.subjectId;
        if (!staffId) {
            throw new BadRequestException("Staff profile required for attendance check-in.");
        }

        const parsed = staffCheckInSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.attendanceService.clockIn(organizationId, staffId, parsed.data);
    }

    @Post("check-out")
    @RequirePermissions(PermissionKey.ATTENDANCE_READ)
    async clockOut(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);

        const staffId = ctx.subjectId;
        if (!staffId) {
            throw new BadRequestException("Staff profile required for attendance check-out.");
        }

        const parsed = staffCheckOutSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.attendanceService.clockOut(organizationId, staffId, parsed.data);
    }

    @Patch(":id/correct")
    @RequirePermissions(PermissionKey.ATTENDANCE_MANAGE)
    async managerCorrection(
        @Param("orgId") orgId: string,
        @Param("id") attendanceId: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);

        const parsed = managerCorrectAttendanceSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.attendanceService.managerCorrection(organizationId, attendanceId, ctx.subjectId, parsed.data);
    }

    @Get()
    @RequirePermissions(PermissionKey.ATTENDANCE_READ)
    async listAttendance(
        @Param("orgId") orgId: string,
        @Query() query: unknown,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = this.resolveOrgId(ctx, orgId);

        const parsed = attendanceQuerySchema.safeParse(query || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.attendanceService.listAttendance(organizationId, parsed.data);
    }
}
