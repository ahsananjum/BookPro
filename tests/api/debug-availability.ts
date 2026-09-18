import { Test } from '@nestjs/testing';
import { AvailabilityModule } from '../src/modules/availability/availability.module';
import { AvailabilityService } from '../src/modules/availability/availability.service';
import { PrismaService } from '../src/modules/database/prisma.service';

async function main() {
    console.log("=== NESTJS BOOTSTRAP AVAILABILITY DEBUG FOR 'testies' ===");

    const moduleRef = await Test.createTestingModule({
        imports: [AvailabilityModule],
    }).compile();

    const prisma = moduleRef.get(PrismaService);
    const availabilityService = moduleRef.get(AvailabilityService);

    const org = await prisma.organization.findFirst({
        where: { slug: 'testies', archivedAt: null },
        include: {
            locations: { where: { archivedAt: null } },
            services: { where: { archivedAt: null } },
            staffProfiles: {
                where: { archivedAt: null },
                include: {
                    staffLocations: true,
                    staffServices: true,
                    availabilities: true,
                },
            },
            policyConfigs: true,
        },
    });

    if (!org) {
        console.error("Organization 'testies' not found!");
        return;
    }

    const service = org.services[0];
    const location = org.locations[0];

    console.log("Location Operating Hours:", JSON.stringify(location.operatingHours, null, 2));

    for (const testDate of ['2026-08-31', '2026-09-01', '2026-09-02']) {
        console.log(`\nTesting searchAvailability for Date: ${testDate}, Location: ${location?.id}, Service: ${service?.id}...`);
        try {
            const result = await availabilityService.searchAvailability({
                organizationId: org.id,
                locationId: location.id,
                serviceId: service.id,
                startDate: testDate,
                endDate: testDate,
                partySize: 1,
            });

            console.log(`Date: ${testDate} -> Result slots count: ${result.slots?.length || 0}`);
            if (result.slots && result.slots.length > 0) {
                console.log("First 3 slots:", result.slots.slice(0, 3));
            }
        } catch (err: any) {
            console.error("searchAvailability error for", testDate, err.message);
        }
    }
}

main().catch(console.error);
