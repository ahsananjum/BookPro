import { Module } from "@nestjs/common";
import { CommissionsService } from "./commissions.service";
import { CommissionsController } from "./commissions.controller";
import { DatabaseModule } from "../database/database.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { PaymentsModule } from "../payments/payments.module";

@Module({
    imports: [DatabaseModule, RealtimeModule, PaymentsModule],
    controllers: [CommissionsController],
    providers: [CommissionsService],
    exports: [CommissionsService],
})
export class CommissionsModule { }
