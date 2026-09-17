const dotenv = require("dotenv");
dotenv.config({ path: "C:/BookPro/.env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
    const orgs = await prisma.organization.findMany({
        select: {
            id: true,
            name: true,
            email: true,
            country: true,
            stripeAccountId: true,
            stripeChargesEnabled: true,
            stripePayoutsEnabled: true,
            stripeDetailsSubmitted: true,
            onboardingStep: true,
            paymentIntent: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
    });
    console.log("Recent Orgs count:", orgs.length);
    console.log("Recent Orgs:", JSON.stringify(orgs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
