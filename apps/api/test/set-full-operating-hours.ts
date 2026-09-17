import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Setting standard 7-day operating hours across all locations...");

    const standardHours = {
        monday: [{ start: "08:00", end: "20:00" }],
        tuesday: [{ start: "08:00", end: "20:00" }],
        wednesday: [{ start: "08:00", end: "20:00" }],
        thursday: [{ start: "08:00", end: "20:00" }],
        friday: [{ start: "08:00", end: "20:00" }],
        saturday: [{ start: "09:00", end: "19:00" }],
        sunday: [{ start: "09:00", end: "19:00" }],
    };

    const updateLocations = await prisma.location.updateMany({
        where: { archivedAt: null },
        data: {
            operatingHours: standardHours as any,
        },
    });

    console.log(`Updated ${updateLocations.count} locations with full 7-day operating hours.`);
}

main().finally(() => prisma.$disconnect());
