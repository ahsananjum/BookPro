import { PrismaClient } from "@prisma/client";
import { CrmService } from "../src/modules/crm/crm.service";

const prisma = new PrismaClient();
const crmService = new CrmService(prisma as any);

async function run() {
    console.log("================================================================================");
    console.log("  CRM & CUSTOMER PORTAL WORKFLOW: LIVE DATABASE VERIFICATION");
    console.log("================================================================================\n");

    const testOrgSlug = `crm-test-${Date.now()}`;
    const testOrgEmail = `owner-${Date.now()}@testcrm.com`;
    const testStaffEmail = `staff-${Date.now()}@testcrm.com`;
    const testCustomerEmail = `customer-${Date.now()}@client.com`;

    try {
        // 1. Create Organization & Staff Member
        console.log("Step 1: Creating verified test organization & staff...");
        const org = await prisma.organization.create({
            data: {
                name: "Apex Dermatology & Spa",
                slug: testOrgSlug,
                email: testOrgEmail,
                currency: "USD",
                timezone: "America/New_York",
                bookingEnabled: true,
                onboardingCompleted: true,
            },
        });

        const staffUser = await prisma.user.create({
            data: {
                email: testStaffEmail,
                fullName: "Dr. Rachel Green",
                passwordHash: "dummy_hash",
            },
        });

        const membership = await prisma.membership.create({
            data: {
                organizationId: org.id,
                userId: staffUser.id,
                roleCode: "OWNER",
                status: "ACTIVE",
            },
        });

        console.log(`[PASS] Organization: ${org.name} (${org.id}) created.`);

        // 2. Create Customer User (to test customer portal account linking)
        console.log("\nStep 2: Pre-registering Customer in platform to test automatic portal linking...");
        const customerUser = await prisma.user.create({
            data: {
                email: testCustomerEmail,
                fullName: "Sophia Martinez",
                accountType: "CUSTOMER",
                emailVerifiedAt: new Date(),
            },
        });
        console.log(`[PASS] Customer user created: ${customerUser.email} (${customerUser.id})`);

        // 3. Create Customer via CRM Service (Simulating Owner Portal "+ Add Customer")
        console.log("\nStep 3: Creating customer via CRM Service...");
        const createdCustomer = await crmService.createCustomer(org.id, staffUser.id, {
            fullName: "Sophia Martinez",
            email: testCustomerEmail,
            phone: "+1 555 234 5678",
            tags: ["VIP", "HighSpend"],
            operationalNotes: "Allergic to scented oils. Prefers morning appointments.",
            consentMarketing: true,
        });

        console.log(`[PASS] Customer created in CRM: ID ${createdCustomer.id}`);
        if (createdCustomer.userId === customerUser.id) {
            console.log("  ✓ Auto-linking SUCCESS: Customer was automatically connected to their Customer Portal account!");
        } else {
            throw new Error(`Expected userId to be ${customerUser.id}, got ${createdCustomer.userId}`);
        }

        // 4. Duplicate Check
        console.log("\nStep 4: Verifying duplicate email rejection...");
        try {
            await crmService.createCustomer(org.id, staffUser.id, {
                fullName: "Duplicate Sophia",
                email: testCustomerEmail,
            });
            throw new Error("Duplicate creation should have thrown ConflictException!");
        } catch (err: any) {
            if (err.status === 409 || err.message?.includes("already exists")) {
                console.log("  ✓ Duplicate customer rejected with ConflictException - PASS");
            } else {
                throw err;
            }
        }

        // 5. Post Confidential Staff Notes
        console.log("\nStep 5: Posting confidential staff notes...");
        const note = await crmService.addCustomerNote(
            org.id,
            createdCustomer.id,
            staffUser.id,
            "Client requested formulation B-12 for chemical peel. Sensitive skin.",
            true
        );
        console.log(`[PASS] Staff note recorded (ID: ${note.id})`);

        // 6. Update Customer Profile & Tags
        console.log("\nStep 6: Updating customer profile & tags...");
        const updated = await crmService.updateCustomer(org.id, createdCustomer.id, staffUser.id, {
            phone: "+1 555 999 8888",
            tags: ["VIP", "HighSpend", "PreferredClient"],
            operationalNotes: "Updated: Allergic to scented oils and lavender.",
        });
        console.log(`[PASS] Customer updated. Tags count: ${updated.tags.length}`);

        // 7. Inspect Customer Details & Timeline (Owner / Staff view)
        console.log("\nStep 7: Inspecting customer details & timeline as Owner...");
        const details = await crmService.getCustomerDetails(org.id, createdCustomer.id, false);
        console.log(`  - Name: ${details.fullName}`);
        console.log(`  - Linked Portal User: ${details.user?.email} (Verified: ${!!details.user?.emailVerifiedAt})`);
        console.log(`  - Staff Notes count: ${details.notes.length} (Author: ${details.notes[0]?.authorName || "Staff"})`);
        console.log(`  - Timeline events count: ${details.timeline.length}`);
        for (const evt of details.timeline) {
            console.log(`    * [${evt.type}] ${evt.title} (${new Date(evt.timestamp).toLocaleTimeString()})`);
        }
        if (details.notes.length === 0) throw new Error("Staff notes missing from staff view!");

        // 8. Test AI Actor Privacy Isolation
        console.log("\nStep 8: Verifying AI Actor Privacy Sanitization...");
        const aiView = await crmService.getCustomerDetails(org.id, createdCustomer.id, true);
        if (aiView.notes.length !== 0) {
            throw new Error(`AI Actor privacy violation! Notes leaked: ${aiView.notes.length}`);
        }
        if (aiView.operationalNotes !== undefined) {
            throw new Error("AI Actor privacy violation! Operational notes leaked.");
        }
        console.log("  ✓ AI Actor Privacy Sanitization: Notes & operational preferences completely stripped - PASS");

        // 9. List Customers via CRM
        console.log("\nStep 9: Verifying customer directory list filtering...");
        const listAll = await crmService.listCustomers(org.id);
        const listPortal = await crmService.listCustomers(org.id, { accountFilter: "PORTAL_MEMBER" });
        const listGuest = await crmService.listCustomers(org.id, { accountFilter: "GUEST" });

        console.log(`  - Total customers: ${listAll.length}`);
        console.log(`  - Portal verified: ${listPortal.length}`);
        console.log(`  - Guests: ${listGuest.length}`);

        if (listAll.length !== 1 || listPortal.length !== 1 || listGuest.length !== 0) {
            throw new Error("Filter counts did not match expected customer states!");
        }
        console.log("  ✓ Directory listing & portal filter: PASS");

        // 10. Clean Up
        console.log("\nStep 10: Cleaning up test data...");
        await crmService.deleteCustomer(org.id, createdCustomer.id, staffUser.id);
        await prisma.user.delete({ where: { id: customerUser.id } });
        await prisma.membership.delete({ where: { id: membership.id } });
        await prisma.user.delete({ where: { id: staffUser.id } });
        await prisma.organization.delete({ where: { id: org.id } });
        console.log("[PASS] Test customer and organization cleanly removed.");

        console.log("\n================================================================================");
        console.log("  ALL LIVE DATABASE & LOGICAL WORKFLOW VERIFICATIONS PASSED SUCCESSFULLY!");
        console.log("================================================================================");
    } catch (error) {
        console.error("Verification failed:", error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

run();
