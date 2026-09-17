import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class IdempotencyJanitorService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(IdempotencyJanitorService.name);
    private janitorTimer: NodeJS.Timeout | null = null;
    private isRunning = false;

    constructor(private readonly prisma: PrismaService) { }

    onModuleInit() {
        this.logger.log("Starting Idempotency Record Expiration Janitor (interval: 60s)...");
        this.janitorTimer = setInterval(() => this.cleanupExpiredRecords(), 60000);
    }

    onModuleDestroy() {
        if (this.janitorTimer) {
            clearInterval(this.janitorTimer);
        }
    }

    async cleanupExpiredRecords(): Promise<number> {
        if (this.isRunning) return 0;
        this.isRunning = true;

        try {
            const now = new Date();
            const result = await this.prisma.idempotencyRecord.deleteMany({
                where: {
                    expiresAt: { lt: now },
                },
            });

            if (result.count > 0) {
                this.logger.log(`Purged ${result.count} expired idempotency records.`);
            }

            return result.count;
        } catch (err: any) {
            this.logger.error(`Error purging expired idempotency records: ${err.message}`, err.stack);
            return 0;
        } finally {
            this.isRunning = false;
        }
    }
}
