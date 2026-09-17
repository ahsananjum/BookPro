import { PrismaClient } from "@prisma/client";

export class IntegrationTestHarness {
    public prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient({
            datasources: {
                db: {
                    url: process.env.DATABASE_URL || "postgresql://bookpro_user:bookpro_pass@localhost:5432/bookpro_dev",
                },
            },
        });
    }

    async cleanDatabase() {
        const tablenames = await this.prisma.$queryRaw<
            Array<{ tablename: string }>
        >`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename != '_prisma_migrations';`;

        const tables = tablenames
            .map(({ tablename }) => `"${tablename}"`)
            .join(", ");

        if (tables.length > 0) {
            await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
        }
    }

    async disconnect() {
        await this.prisma.$disconnect();
    }
}
