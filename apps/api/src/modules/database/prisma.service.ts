import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    async onModuleInit() {
        try {
            await this.$connect();
            console.log("[PrismaService] Connected to database successfully");
        } catch (err: any) {
            console.error("[PrismaService] Initial database connection warning:", err.message || err);
        }
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
