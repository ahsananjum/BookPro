/**
 * reset-transactional-data.js
 *
 * Wipes ALL transactional/operational data while preserving configuration.
 *
 * Run: node --env-file=.env prisma/scripts/reset-transactional-data.js
 *  or: pnpm db:reset-transactional
 *
 * DELETED:   appointments, customers, payments, notifications, outbox_events,
 *            external calendar events, waitlist, AI, analytics, audit_logs,
 *            auth_sessions, email_campaigns, schedule_blocks, etc.
 *
 * PRESERVED: organizations, locations, staff users/profiles/availability,
 *            services, plans, roles, email templates, google_calendar_connections,
 *            mfa_credentials, location_holidays, stored_assets, industry_templates.
 *
 * ⚠️  IRREVERSIBLE. Ensure you have a backup.
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

function ask(question) {
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
  console.log('  BookPro — Transactional Data Reset');
  console.log('═'.repeat(62));
  console.log();
  console.log('DB:', process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@'));
  console.log();
  console.log('DELETES:  appointments, customers, payments, notifications,');
  console.log('          outbox_events, calendar events, waitlist, AI,');
  console.log('          analytics, audit_logs, auth_sessions, campaigns...');
  console.log();
  console.log('KEEPS:    org config, staff, services, locations, availability,');
  console.log('          plans, roles, email templates, calendar connections...');
  console.log();

  const confirm = await ask('▶ Type "WIPE" to confirm and proceed: ');
  if (confirm !== 'WIPE') {
    console.log('\n✗ Aborted. You must type WIPE exactly.\n');
    process.exit(0);
  }

  console.log('\n─── Deleting (children first) ───\n');

  // Tier 1: Deepest leaf children
  await del('calendar_sync_conflicts');
  await del('external_calendar_events');
  await del('ai_tool_executions');
  await del('ai_action_proposals');
  await del('ai_conversations');
  await del('waitlist_offers');
  await del('waitlist_entries');
  await del('schedule_insights');
  await del('reviews');
  await del('commission_records');
  await del('financial_ledger_entries');
  await del('cancellation_quotes');
  await del('refund_records');
  await del('payment_records');
  await del('outbox_events');
  await del('notifications');
  await del('intake_responses');
  await del('appointment_histories');
  await del('appointment_resources');

  // Tier 2: Appointments
  await del('appointments');

  // Tier 3: Booking holds & recurrence
  await del('booking_holds');
  await del('recurrence_series');

  // Tier 4: Customers
  await del('customer_notes');
  await del('customer_invitations');
  await del('customers');
  // Only CUSTOMER-type users (guest/booker accounts). Staff preserved.
  await del('users', `"account_type" = 'CUSTOMER'`);

  // Tier 5: Staff operational (NOT configuration)
  await del('staff_attendance');
  await del('staff_leaves');
  await del('schedule_blocks');    // manual blocks only; staff_availabilities kept

  // Tier 6: Ops/infra
  await del('schedule_guards');
  await del('idempotency_records');
  await del('webhook_inbox');
  await del('data_exports');
  await del('product_analytics_events');
  await del('reconciliation_incidents');
  await del('stripe_oauth_states');
  await del('google_oauth_states');
  await del('auth_rate_limits');

  // Tier 7: Email campaigns (templates preserved)
  await del('email_campaigns');

  // Tier 8: Analytics / metrics
  await del('org_daily_metrics');
  await del('location_daily_metrics');
  await del('staff_daily_metrics');
  await del('service_daily_metrics');
  await del('waitlist_daily_metrics');

  // Tier 9: Audit logs
  await del('audit_logs');

  // Tier 10: Auth sessions (forces re-login)
  await del('auth_refresh_tokens');
  await del('auth_sessions');

  // Tier 11: Token / verification tables
  await del('email_verification_tokens');
  await del('registration_requests');
  await del('mfa_challenges');

  // Summary
  console.log('\n' + '═'.repeat(62));
  console.log(`  ✅  Done! Total rows deleted: ${total}`);
  console.log('═'.repeat(62));
  console.log();
  console.log('PRESERVED:');
  console.log('  ✓ organizations, locations, policy_configs');
  console.log('  ✓ users (staff/admin), memberships, staff_profiles');
  console.log('  ✓ staff_availabilities, staff_breaks, staff_locations');
  console.log('  ✓ staff_services, services, intake_forms');
  console.log('  ✓ resource_pools, resources, service_resources');
  console.log('  ✓ plans, entitlements, feature_overrides');
  console.log('  ✓ roles, role_permissions');
  console.log('  ✓ organization_email_templates');
  console.log('  ✓ coupons, commission_rules');
  console.log('  ✓ google_calendar_connections');
  console.log('  ✓ mfa_credentials, mfa_recovery_codes');
  console.log('  ✓ location_holidays, stored_assets, industry_templates');
  console.log();
  console.log('⚠️  All staff sessions wiped — log in again.');
  console.log('⚠️  Google Calendar connections preserved; may need re-auth.');
  console.log();
}

main()
  .catch((e) => { console.error('\n✗ Fatal:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
