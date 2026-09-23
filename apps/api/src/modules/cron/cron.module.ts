import { Module } from "@nestjs/common";
import { CronController } from "./cron.controller";
import { CronService } from "./cron.service";
import { OutboxModule } from "../outbox/outbox.module";

@Module({
    imports: [OutboxModule],
    controllers: [CronController],
    providers: [CronService],
    exports: [CronService],
})
export class CronModule { }
