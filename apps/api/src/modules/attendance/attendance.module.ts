import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CommonModule } from "../common/common.module";
import { StaffAttendanceService } from "./staff-attendance.service";
import { AttendanceController } from "./attendance.controller";

@Module({
    imports: [DatabaseModule, CommonModule],
    controllers: [AttendanceController],
    providers: [StaffAttendanceService],
    exports: [StaffAttendanceService],
})
export class AttendanceModule {}
