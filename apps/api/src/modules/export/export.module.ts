import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CommonModule } from "../common/common.module";
import { DataExportService } from "./data-export.service";
import { ExportController } from "./export.controller";

@Module({
    imports: [DatabaseModule, CommonModule],
    controllers: [ExportController],
    providers: [DataExportService],
    exports: [DataExportService],
})
export class ExportModule {}
