/**
 * full-reset.js
 *
 * COMPLETE database wipe for production launch preparation.
 * Deletes ALL organizations, users, and operational data.
 *
 * Only keeps system-level reference tables:
 *   - plans         (subscription tiers)
 *   - roles         (RBAC role definitions)
 *   - role_permissions
 *   - industry_templates
 *
 * Run: node --env-file=.env prisma/scripts/full-reset.js
 *  or: pnpm db:full-reset
 *
 * ⚠️  COMPLETELY IRREVERSIBLE. Use only before production launch.
 */

'use strict';

process.env.DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!process.env.DATABASE_URL) {
  console.error('✗ No DATABASE_URL or DIRECT_URL set. Exiting.');
  process.exit(1);
}

const { PrismaClient } = require('@prisma/client');
const readline = require('readline');

const prisma = new PrismaClient({ log: ['error'] });

// Support --yes flag to skip interactive prompts (for scripted use)
const skipPrompt = process.argv.includes('--yes');

function ask(question) {
  if (skipPrompt) {
    process.stdout.write(question + ' [auto-confirmed via --yes]\n');
    return Promise.resolve('__AUTO__');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}


let total = 0;

async function del(tableName, where) {
  try {
    const sql = where
      ? `DELETE FROM "${tableName}" WHERE ${where}`
      : `DELETE FROM "${tableName}"`;
    const count = await prisma.$executeRawUnsafe(sql);
    total += count;
    console.log(`  ✓ ${tableName.padEnd(44)} ${String(count).padStart(6)} rows`);
    return count;
  } catch (err) {
    console.error(`  ✗ ${tableName.padEnd(44)} ERROR: ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log('═'.repeat(62));
  console.log('  BookPro — FULL PRODUCTION RESET');
  console.log('═'.repeat(62));
  console.log();
  console.log('DB:', process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@'));
  console.log();
  console.log('⚠️  This deletes EVERYTHING:');
  console.log('    All organizations, all users, all data.');
  console.log();
  console.log('KEEPS (system reference only):');
  console.log('    plans, roles, role_permissions, industry_templates');
  console.log();

  const confirm1 = await ask('▶ Type "PRODUCTION" to confirm this is intentional: ');
  if (confirm1 !== 'PRODUCTION' && confirm1 !== '__AUTO__') {
    console.log('\n✗ Aborted.\n');
    process.exit(0);
  }

  const confirm2 = await ask('▶ Type "WIPE ALL" to execute (cannot be undone): ');
  if (confirm2 !== 'WIPE ALL' && confirm2 !== '__AUTO__') {
    console.log('\n✗ Aborted.\n');
    process.exit(0);
  }

  console.log('\n─── Step 1: Delete all organizations (cascades most data) ───\n');

  // Deleting all organizations cascades the vast majority of data:
  // locations, memberships, staff_profiles, services, customers, appointments,
  // notifications, outbox_events, payment_records, and ~50 more tables.
  await del('organizations');

  console.log('\n─── Step 2: Clean up remaining non-org-scoped tables ───\n');

  // These tables are NOT org-scoped (no organizationId FK cascade from org delete)
  await del('webhook_inbox');
  await del('auth_refresh_tokens');
  await del('auth_sessions');
  await del('mfa_challenges');
  await del('mfa_recovery_codes');
  await del('mfa_credentials');
  await del('email_verification_tokens');
  await del('registration_requests');
  await del('auth_rate_limits');
  await del('google_oauth_states');  // not org-cascaded (no org FK)

  // Finally delete all users
  await del('users');

  // Summary
  console.log('\n' + '═'.repeat(62));
  console.log(`  ✅  Done! Total rows deleted: ${total}`);
  console.log('═'.repeat(62));
  console.log();
  console.log('PRESERVED (system reference data):');
  console.log('  ✓ plans               (subscription tiers)');
  console.log('  ✓ roles               (RBAC definitions)');
  console.log('  ✓ role_permissions    (RBAC permissions)');
  console.log('  ✓ industry_templates  (onboarding reference data)');
  console.log();
  console.log('Your database is now clean and ready for production launch.');
  console.log('The first user to sign up will create a fresh organization.');
  console.log();
}

main()
  .catch((e) => { console.error('\n✗ Fatal:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
