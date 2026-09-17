import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { CommonModule } from "../common/common.module";
import { QrCheckInService } from "./qr-check-in.service";
import { QrCheckInController } from "./qr-check-in.controller";

@Module({
    imports: [DatabaseModule, RealtimeModule, CommonModule],
    controllers: [QrCheckInController],
    providers: [QrCheckInService],
    exports: [QrCheckInService],
})
export class CheckInModule {}
