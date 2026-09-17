import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const orgs = await prisma.organization.findMany({
        select: {
            id: true,
            name: true,
            slug: true,
            brandName: true,
            bookingEnabled: true,
            isActive: true,
            _count: {
                select: {
                    services: { where: { archivedAt: null } },
                    locations: { where: { archivedAt: null } },
                    staffProfiles: { where: { archivedAt: null } },
                },
            },
        },
    });

    console.log("Database Organizations:");
    console.dir(orgs, { depth: null });
}

main().finally(() => prisma.$disconnect());
