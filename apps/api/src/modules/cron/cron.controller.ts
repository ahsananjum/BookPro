import { Controller, Get, Headers, UnauthorizedException, Logger } from "@nestjs/common";
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
}
