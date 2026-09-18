import { Module } from "@nestjs/common";
import { CronController } from "./cron.controller";
import { CronService } from "./cron.service";
import { WorkerModule } from "@bookpro/worker";

@Module({
    imports: [WorkerModule],
    controllers: [CronController],
    providers: [CronService],
    exports: [CronService],
})
export class CronModule { }
