// db-test.js — quick connection test, run with:
//   node --env-file=.env prisma/scripts/db-test.js
'use strict';

process.env.DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ log: [] });

(async () => {
  try {
    const tables = [
      'appointments', 'customers', 'booking_holds', 'payment_records',
      'notifications', 'outbox_events', 'auth_sessions', 'audit_logs',
      'email_campaigns', 'commission_records',
      'organizations', 'locations', 'staff_profiles', 'services',
      'staff_availabilities', 'memberships',
    ];

    console.log('✓ DB:', process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@'));
    console.log('\n── Row counts ──');
    for (const t of tables) {
      const r = await p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "${t}"`);
      console.log(`  ${t.padEnd(44)} ${r[0].c} rows`);
    }
    console.log('\n✓ Connection OK — script is ready to run.\n');
  } finally {
    await p.$disconnect();
  }
})();
