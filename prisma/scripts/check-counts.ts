// Quick connectivity and row-count preview — not the real reset.
// Run: pnpm db:check-counts
import { PrismaClient } from '@prisma/client';

const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('✗ No DATABASE_URL set'); process.exit(1);
}
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({ log: ['error'] });

async function count(table: string) {
  const r = await prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT COUNT(*) as c FROM "${table}"`);
  return r[0].c.toString();
}

async function main() {
  console.log('DB:', dbUrl!.replace(/:([^:@]+)@/, ':****@'));
  console.log('\n── Will be WIPED ──');
  const wiped = [
    'appointments', 'customers', 'booking_holds', 'payment_records',
    'notifications', 'outbox_events', 'external_calendar_events',
    'waitlist_entries', 'ai_conversations', 'auth_sessions', 'audit_logs',
    'email_campaigns', 'commission_records', 'reviews',
    'org_daily_metrics', 'staff_daily_metrics',
  ];
  for (const t of wiped) console.log(`  ${t.padEnd(44)} ${await count(t)} rows`);

  console.log('\n── Will be PRESERVED ──');
  const kept = [
    'organizations', 'locations', 'staff_profiles', 'services',
    'staff_availabilities', 'memberships', 'users',
    'google_calendar_connections', 'organization_email_templates',
  ];
  for (const t of kept) console.log(`  ${t.padEnd(44)} ${await count(t)} rows`);
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
