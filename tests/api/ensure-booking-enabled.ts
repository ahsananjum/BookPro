import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Enabling booking and verifying services/locations across organizations...");

    // Update all organizations to have bookingEnabled: true, isActive: true
    const res = await prisma.organization.updateMany({
        data: {
            bookingEnabled: true,
            isActive: true,
        },
    });
    console.log(`Updated ${res.count} organizations to bookingEnabled: true`);

    const orgs = await prisma.organization.findMany({
        include: {
            services: { where: { archivedAt: null } },
            locations: { where: { archivedAt: null } },
            staffProfiles: { where: { archivedAt: null } },
        },
    });

    for (const org of orgs) {
        // Ensure standard location exists
        let location = org.locations[0];
        if (!location) {
            console.log(`Adding default location to org: ${org.name} (${org.slug})`);
            location = await prisma.location.create({
                data: {
                    organizationId: org.id,
                    name: "Main Studio",
                    slug: `main-studio-${Date.now()}`,
                    address: "100 Broadway, Suite 400",
                    city: "New York",
                    state: "NY",
                    postalCode: "10001",
                    timezone: org.timezone || "America/New_York",
                },
            });
        }

        // If org has 0 services, add standard starter services
        let currentServices = org.services;
        if (currentServices.length === 0) {
            console.log(`Adding default starter services to org: ${org.name} (${org.slug})`);
            const s1 = await prisma.service.create({
                data: {
                    organizationId: org.id,
                    name: "Signature Haircut & Style",
                    description: "Full consultation, bespoke haircut, wash, and signature blowout style.",
                    durationMin: 45,
                    priceCents: 8500,
                    currency: org.currency || "USD",
                    isActive: true,
                },
            });
            const s2 = await prisma.service.create({
                data: {
                    organizationId: org.id,
                    name: "Deep Tissue & Aromatherapy Massage",
                    description: "Full body restorative deep tissue treatment with custom organic essential oils.",
                    durationMin: 60,
                    priceCents: 14000,
                    currency: org.currency || "USD",
                    isActive: true,
                },
            });
            currentServices = [s1, s2];
            console.log(`  Added: ${s1.name} and ${s2.name}`);
        }

        // If org has 0 staff, add standard staff
        if (org.staffProfiles.length === 0) {
            console.log(`Adding default staff member to org: ${org.name} (${org.slug})`);
            const user = await prisma.user.create({
                data: {
                    email: `lead.stylist.${org.slug}.${Date.now()}@bookpro.test`,
                    passwordHash: "test_hash",
                    fullName: "Alex Morgan",
                },
            });

            const membership = await prisma.membership.create({
                data: {
                    organizationId: org.id,
                    userId: user.id,
                    roleCode: "STAFF",
                    status: "ACTIVE",
                },
            });

            const staff = await prisma.staffProfile.create({
                data: {
                    organizationId: org.id,
                    membershipId: membership.id,
                    displayName: "Alex Morgan",
                    title: "Senior Specialist",
                    isActive: true,
                    bookingVisible: true,
                },
            });

            // Assign staff to location
            await prisma.staffLocation.create({
                data: {
                    staffId: staff.id,
                    locationId: location.id,
                },
            });

            // Assign staff to services
            for (const s of currentServices) {
                await prisma.staffService.create({
                    data: {
                        staffId: staff.id,
                        serviceId: s.id,
                    },
                });
            }
        }
    }

    console.log("All organizations successfully verified with active services, locations, and staff assignments.");
}

main().finally(() => prisma.$disconnect());
