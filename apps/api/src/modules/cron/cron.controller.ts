import { Controller, Get, Post, Headers, UnauthorizedException, Logger } from "@nestjs/common";
import { CronService } from "./cron.service";
import { Public } from "@bookpro/server-core";

@Controller("cron")
export class CronController {
    private readonly logger = new Logger(CronController.name);

    constructor(private readonly cronService: CronService) { }

    @Public()
    @Get("worker")
    async runWorkerCron(@Headers("authorization") authHeader?: string) {
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            this.logger.warn("Unauthorized attempt to invoke cron/worker");
            throw new UnauthorizedException("Invalid CRON_SECRET authorization");
        }

        const result = await this.cronService.runAll();
        return {
            success: true,
            timestamp: new Date().toISOString(),
            ...result,
        };
    }

    @Public()
    @Get("drain-outbox")
    @Post("drain-outbox")
    async drainOutbox(@Headers("authorization") authHeader?: string) {
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            this.logger.warn("Unauthorized attempt to invoke cron/drain-outbox");
            throw new UnauthorizedException("Invalid CRON_SECRET authorization");
        }

        const dispatched = await this.cronService.processPendingOutbox(new Date(), 50);
        return {
            success: true,
            timestamp: new Date().toISOString(),
            dispatched,
        };
    }
}
