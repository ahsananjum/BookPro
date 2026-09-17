const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// Use DIRECT_URL for admin operations (bypasses pgbouncer)
const db = new PrismaClient();

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const LOC_ID = '00000000-0000-0000-0000-000000000002';
const STAFF_ID = '00000000-0000-0000-0000-000000000005'; // Elena Rostova
const SVC_1_ID = '00000000-0000-0000-0000-000000000003'; // Signature Balayage
const SVC_2_ID = '00000000-0000-0000-0000-000000000004'; // Botanical Hair Spa
const MEMBERSHIP_ID_ELENA = '00000000-0000-0000-0000-000000000009'; // elena's membership

async function runRepairs() {
  console.log("=== BookPro Comprehensive Seed & Repair Script ===\n");

  // 1. Fix Elena's password
  const pwHash = await bcrypt.hash('password123', 10);
  await db.user.update({
    where: { id: '00000000-0000-0000-0000-000000000009' },
    data: { passwordHash: pwHash },
  });
  console.log("✅ Fixed Elena Rostova password (elena.rostova@luxestudio.com / password123)");

  // 2. Ensure owner@luxestudio.com exists (for frontend demos)
  const existingOwner = await db.user.findUnique({ where: { email: 'owner@luxestudio.com' } });
  if (!existingOwner) {
    const ownerUser = await db.user.create({
      data: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'owner@luxestudio.com',
        fullName: 'Studio Owner',
        passwordHash: pwHash,
        isActive: true,
        isPlatformAdmin: false,
      }
    });
    await db.membership.upsert({
      where: { organizationId_userId: { organizationId: ORG_ID, userId: ownerUser.id } },
      create: { organizationId: ORG_ID, userId: ownerUser.id, roleCode: 'OWNER', status: 'ACTIVE' },
      update: { roleCode: 'OWNER', status: 'ACTIVE' },
    });
    console.log("✅ Created owner@luxestudio.com (password123) with OWNER membership");
  } else {
    await db.user.update({ where: { email: 'owner@luxestudio.com' }, data: { passwordHash: pwHash } });
    console.log("✅ Updated owner@luxestudio.com password (password123)");
  }

  // 3. Fix Location operating hours
  await db.location.update({
    where: { id: LOC_ID },
    data: {
      operatingHours: [
        { dayOfWeek: 1, startTime: '09:00', endTime: '20:00', isClosed: false }, // Mon
        { dayOfWeek: 2, startTime: '09:00', endTime: '20:00', isClosed: false }, // Tue
        { dayOfWeek: 3, startTime: '09:00', endTime: '20:00', isClosed: false }, // Wed
        { dayOfWeek: 4, startTime: '09:00', endTime: '20:00', isClosed: false }, // Thu
        { dayOfWeek: 5, startTime: '09:00', endTime: '20:00', isClosed: false }, // Fri
        { dayOfWeek: 6, startTime: '10:00', endTime: '18:00', isClosed: false }, // Sat
        { dayOfWeek: 0, startTime: '11:00', endTime: '16:00', isClosed: false }, // Sun
      ],
      bookingEnabled: true,
    }
  });
  console.log("✅ Set Manhattan Flagship operating hours (Mon-Sun)");

  // Enable booking for the org
  await db.organization.update({
    where: { id: ORG_ID },
    data: { bookingEnabled: true, onboardingCompleted: true, onboardingStep: 11 }
  });
  console.log("✅ Enabled bookingEnabled on organization");

  // 4. Fix Elena's membership (ensure it has her user id)
  const elenaUser = await db.user.findUnique({ where: { id: '00000000-0000-0000-0000-000000000009' } });
  if (elenaUser) {
    await db.membership.upsert({
      where: { organizationId_userId: { organizationId: ORG_ID, userId: elenaUser.id } },
      create: {
        organizationId: ORG_ID,
        userId: elenaUser.id,
        roleCode: 'STAFF',
        status: 'ACTIVE',
        locationIds: [LOC_ID],
      },
      update: {
        roleCode: 'STAFF',
        status: 'ACTIVE',
        locationIds: [LOC_ID],
      }
    });
    console.log("✅ Ensured Elena's membership is ACTIVE");
  }

  // 5. Fix Staff Location assignment
  await db.staffLocation.upsert({
    where: { staffId_locationId: { staffId: STAFF_ID, locationId: LOC_ID } },
    create: { staffId: STAFF_ID, locationId: LOC_ID },
    update: {},
  });
  console.log("✅ Assigned Elena Rostova to Manhattan Flagship location");

  // 6. Fix Staff Service assignments
  await db.staffService.upsert({
    where: { staffId_serviceId: { staffId: STAFF_ID, serviceId: SVC_1_ID } },
    create: { staffId: STAFF_ID, serviceId: SVC_1_ID },
    update: {},
  });
  await db.staffService.upsert({
    where: { staffId_serviceId: { staffId: STAFF_ID, serviceId: SVC_2_ID } },
    create: { staffId: STAFF_ID, serviceId: SVC_2_ID },
    update: {},
  });
  console.log("✅ Assigned Elena to both Signature Balayage and Botanical Hair Spa services");

  // 7. Fix Staff Availability (recurring weekly schedule)
  // Delete existing to avoid duplicates, then create fresh
  await db.staffAvailability.deleteMany({ where: { staffId: STAFF_ID } });
  const availabilityDays = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '19:00' }, // Mon
    { dayOfWeek: 2, startTime: '09:00', endTime: '19:00' }, // Tue
    { dayOfWeek: 3, startTime: '10:00', endTime: '20:00' }, // Wed
    { dayOfWeek: 4, startTime: '09:00', endTime: '19:00' }, // Thu
    { dayOfWeek: 5, startTime: '09:00', endTime: '19:00' }, // Fri
    { dayOfWeek: 6, startTime: '10:00', endTime: '17:00' }, // Sat
  ];
  for (const av of availabilityDays) {
    await db.staffAvailability.create({
      data: {
        organizationId: ORG_ID,
        staffId: STAFF_ID,
        locationId: LOC_ID,
        dayOfWeek: av.dayOfWeek,
        startTime: av.startTime,
        endTime: av.endTime,
      }
    });
  }
  console.log("✅ Created Elena availability schedule (Mon-Sat)");

  // 8. Add lunch break
  await db.staffBreak.deleteMany({ where: { staffId: STAFF_ID } });
  await db.staffBreak.create({
    data: {
      organizationId: ORG_ID,
      staffId: STAFF_ID,
      dayOfWeek: null, // Every day
      startTime: '13:00',
      endTime: '14:00',
      label: 'Lunch Break',
    }
  });
  console.log("✅ Added daily lunch break for Elena (13:00-14:00)");

  // 9. Add the unique constraint for schedule_guards if missing
  try {
    await db.$executeRawUnsafe(`
      ALTER TABLE "schedule_guards" 
      ADD CONSTRAINT "schedule_guards_organizationId_subjectType_subjectId_dateBucket_key" 
      UNIQUE ("organizationId", "subjectType", "subjectId", "dateBucket")
    `);
    console.log("✅ Added unique constraint to schedule_guards");
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log("✅ schedule_guards unique constraint already exists");
    } else {
      console.log("⚠️  Could not add unique constraint:", e.message);
    }
  }

  // 10. Ensure the commission record will work by fixing Elena's staffProfile reference
  const elenaProfile = await db.staffProfile.findUnique({ where: { id: STAFF_ID } });
  console.log("✅ Elena Staff Profile exists:", !!elenaProfile, "orgId:", elenaProfile?.organizationId);

  // 11. Create seed customers if none
  const custCount = await db.customer.count({ where: { organizationId: ORG_ID } });
  if (custCount === 0) {
    await db.customer.createMany({
      data: [
        {
          id: '00000000-0000-0000-0000-000000000021',
          organizationId: ORG_ID,
          fullName: 'Victoria Sterling',
          email: 'victoria.sterling@example.com',
          phone: '+1 (212) 555-0198',
          tags: ['VIP', 'Regular'],
          totalSpentCents: 75000,
          completedAppointmentsCount: 3,
          consentMarketing: true,
          consentSource: 'booking_form',
        },
        {
          id: '00000000-0000-0000-0000-000000000022',
          organizationId: ORG_ID,
          fullName: 'Marcus Vance',
          email: 'marcus.vance@example.com',
          phone: '+1 (917) 555-4832',
          tags: ['New'],
          totalSpentCents: 12000,
          completedAppointmentsCount: 1,
          consentMarketing: false,
        },
      ],
      skipDuplicates: true,
    });
    console.log("✅ Created seed customers (Victoria Sterling, Marcus Vance)");
  } else {
    console.log("✅ Customers already exist:", custCount);
  }

  // 12. Create a future confirmed appointment
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 3);
  futureDate.setUTCHours(14, 0, 0, 0); // 2PM UTC
  const futureEnd = new Date(futureDate);
  futureEnd.setUTCHours(16, 0, 0, 0); // 4PM UTC

  const existingAppt = await db.appointment.findFirst({
    where: { organizationId: ORG_ID, status: 'CONFIRMED' }
  });
  if (!existingAppt) {
    await db.appointment.upsert({
      where: { id: '00000000-0000-0000-0000-000000000032' },
      create: {
        id: '00000000-0000-0000-0000-000000000032',
        organizationId: ORG_ID,
        locationId: LOC_ID,
        serviceId: SVC_1_ID,
        staffId: STAFF_ID,
        customerId: '00000000-0000-0000-0000-000000000021',
        startAt: futureDate,
        endAt: futureEnd,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        bookingSource: 'CUSTOMER_WEB',
        priceCents: 25000,
        currency: 'USD',
        version: 1,
      },
      update: {
        status: 'CONFIRMED',
        startAt: futureDate,
        endAt: futureEnd,
      }
    });
    console.log("✅ Created confirmed future appointment (Victoria Sterling, Signature Balayage)");
  } else {
    console.log("✅ Confirmed appointment already exists");
  }

  // 13. Fix appointment 00000000-0000-0000-0000-000000000031 status (currently NO_SHOW from testing)
  const oldAppt = await db.appointment.findUnique({ where: { id: '00000000-0000-0000-0000-000000000031' } });
  if (oldAppt && oldAppt.status === 'NO_SHOW') {
    // Keep it as-is - it was a valid test. Create a clean CONFIRMED one instead.
    console.log("✅ Appointment 031 is NO_SHOW (from testing) - leaving as historical record");
  }

  console.log("\n=== REPAIR COMPLETE ===");
  console.log("Login Credentials:");
  console.log("  owner@luxestudio.com / password123  (OWNER)");
  console.log("  elena.rostova@luxestudio.com / password123  (STAFF)");
  console.log("  owner@bookpro.dev / [existing password]  (PLATFORM ADMIN)");
  console.log("\nVerification:");

  // Re-check staff
  const staffCheck = await db.staffProfile.findFirst({
    where: { id: STAFF_ID },
    include: { staffLocations: true, staffServices: true, availabilities: true }
  });
  console.log("Elena status:", {
    locationCount: staffCheck?.staffLocations.length,
    serviceCount: staffCheck?.staffServices.length,
    availabilityCount: staffCheck?.availabilities.length,
  });

  // Check constraints
  const constraints = await db.$queryRawUnsafe(
    "SELECT conname FROM pg_constraint WHERE conrelid = 'schedule_guards'::regclass"
  );
  console.log("schedule_guards constraints:", JSON.stringify(constraints));

  await db.$disconnect();
}

runRepairs().catch(e => { 
  console.error("REPAIR FAILED:", e.message); 
  db.$disconnect(); 
});
