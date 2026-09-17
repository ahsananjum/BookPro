const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function checkAll() {
  // Check staff
  const staff = await db.staffProfile.findMany({ 
    include: { staffLocations: true, staffServices: true, availabilities: true }
  });
  console.log("=== STAFF PROFILES ===");
  staff.forEach(s => console.log(JSON.stringify({ id: s.id, name: s.displayName, isActive: s.isActive, locationCount: s.staffLocations.length, serviceCount: s.staffServices.length, availabilityCount: s.availabilities.length })));
  
  // Check services
  const services = await db.service.findMany({ select: { id: true, organizationId: true, name: true, isActive: true, durationMin: true, priceCents: true }});
  console.log("\n=== SERVICES ===");
  services.forEach(s => console.log(JSON.stringify(s)));
  
  // Check appointments
  const appts = await db.appointment.findMany({ take: 5, include: { customer: true, service: true }});
  console.log("\n=== APPOINTMENTS (latest 5) ===");
  appts.forEach(a => console.log(JSON.stringify({ id: a.id, status: a.status, service: a.service?.name, customer: a.customer?.fullName })));
  
  // Check policy configs
  const policies = await db.policyConfig.findMany({ select: { id: true, organizationId: true, minNoticeHours: true, cancelCutoffHours: true, holdDurationMinutes: true }});
  console.log("\n=== POLICIES ===");
  policies.forEach(p => console.log(JSON.stringify(p)));

  // Check schedule_guards unique constraint
  const guards = await db.$queryRawUnsafe("SELECT conname, contype FROM pg_constraint WHERE conrelid = 'schedule_guards'::regclass");
  console.log("\n=== SCHEDULE_GUARDS CONSTRAINTS ===");
  console.log(JSON.stringify(guards, null, 2));
  
  // Check commission rules
  const rules = await db.commissionRule.findMany();
  console.log("\n=== COMMISSION RULES ===");
  rules.forEach(r => console.log(JSON.stringify({ id: r.id, name: r.name, staffId: r.staffId, type: r.calculationType, rate: r.rateValue, isActive: r.isActive })));
  
  // Check outbox events
  const outbox = await db.outboxEvent.count({ where: { status: 'PENDING' }});
  console.log("\n=== PENDING OUTBOX EVENTS ===", outbox);
  
  // Check the exact location for org 1 - operating hours
  const loc = await db.location.findFirst({ where: { id: '00000000-0000-0000-0000-000000000002' }});
  console.log("\n=== MAIN LOCATION DETAILS ===");
  console.log(JSON.stringify({ id: loc?.id, name: loc?.name, timezone: loc?.timezone, operatingHours: loc?.operatingHours }));

  await db.$disconnect();
}

checkAll().catch(e => { console.error(e.message); db.$disconnect(); });
