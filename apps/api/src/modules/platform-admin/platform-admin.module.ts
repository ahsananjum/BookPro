import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CommonModule } from "../common/common.module";
import { RedisService } from "@bookpro/server-core";
import { PlatformAdminService } from "./platform-admin.service";
import { PlatformAdminController } from "./platform-admin.controller";

@Module({
    imports: [DatabaseModule, CommonModule],
    controllers: [PlatformAdminController],
    providers: [PlatformAdminService, RedisService],
    exports: [PlatformAdminService],
})
export class PlatformAdminModule {}
