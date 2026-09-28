import { Module } from "@nestjs/common";
import { CronController } from "./cron.controller";
import { CronService } from "./cron.service";
import { OutboxModule } from "../outbox/outbox.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
    imports: [OutboxModule, RealtimeModule],
    controllers: [CronController],
    providers: [CronService],
    exports: [CronService],
})
export class CronModule { }
