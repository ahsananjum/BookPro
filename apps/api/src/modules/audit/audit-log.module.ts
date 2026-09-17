import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CommonModule } from "../common/common.module";
import { AuditLogQueryService } from "./audit-log-query.service";
import { AuditLogController } from "./audit-log.controller";

@Module({
    imports: [DatabaseModule, CommonModule],
    controllers: [AuditLogController],
    providers: [AuditLogQueryService],
    exports: [AuditLogQueryService],
})
export class AuditLogModule {}
