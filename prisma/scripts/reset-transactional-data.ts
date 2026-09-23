/**
 * reset-transactional-data.ts
 *
 * Wipes ALL transactional / operational data from the BookPro database
 * while PRESERVING all configuration data (org settings, staff, services,
 * locations, plans, roles, email templates, Google Calendar connections, etc).
 *
 * Usage (DATABASE_URL loaded via --env-file by the npm script):
 *   pnpm db:reset-transactional
 *
 * ⚠️  THIS IS IRREVERSIBLE. Make sure you have a backup.
 *
 * DELETED: appointments, customers, payments, notifications, outbox_events,
 *          external calendar events, waitlist, AI conversations, reviews,
 *          analytics/metrics, audit_logs, auth_sessions, email_campaigns, etc.
 *
 * PRESERVED: organizations, locations, staff (users/profiles/availability),
 *            services, intake_forms, resources, plans, roles, templates,
 *            coupons, commission_rules, google_calendar_connections,
 *            mfa_credentials, location_holidays, stored_assets, industry_templates.
 */

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

// DATABASE_URL and DIRECT_URL are injected via --env-file flag in the npm script.
// We prefer DIRECT_URL (bypasses pgBouncer) for raw transactional deletes.
const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('✗ Neither DIRECT_URL nor DATABASE_URL is set. Exiting.');
  process.exit(1);
}

// Override so PrismaClient picks up the direct URL
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({ log: ['error'] });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    }),
  );
}

async function deleteTable(tableName: string, where?: string): Promise<number> {
  try {
    const sql = where
      ? `DELETE FROM "${tableName}" WHERE ${where}`
      : `DELETE FROM "${tableName}"`;
    const count = await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${tableName.padEnd(44)} ${String(count).padStart(6)} rows deleted`);
    return count;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${tableName.padEnd(44)} ERROR: ${msg}`);
    throw err;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(62));
  console.log('  BookPro — Transactional Data Reset');
  console.log('═'.repeat(62));
  console.log();
  console.log('DATABASE:', dbUrl!.replace(/:([^:@]+)@/, ':****@'));
  console.log();
  console.log('DELETES:  appointments, customers, payments, notifications,');
  console.log('          outbox events, calendar events, waitlist, AI,');
  console.log('          analytics, audit logs, auth sessions, campaigns...');
  console.log();
  console.log('KEEPS:    org config, staff profiles, services, locations,');
  console.log('          availability, plans, roles, email templates,');
  console.log('          Google Calendar connections, MFA credentials...');
  console.log();

  const confirm = await ask('▶ Type "WIPE" to confirm and proceed: ');
  if (confirm !== 'WIPE') {
    console.log('\n✗ Aborted — you must type WIPE exactly.\n');
    process.exit(0);
  }

  console.log('\n─── Deleting (child tables first) ───\n');
  let total = 0;
  const del = async (t: string, where?: string) => { total += await deleteTable(t, where); };

  // ── Tier 1: Deepest leaf tables ──────────────────────────────────────────
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

  // ── Tier 2: Appointments ─────────────────────────────────────────────────
  await del('appointments');

  // ── Tier 3: Booking holds & recurrence series ────────────────────────────
  await del('booking_holds');
  await del('recurrence_series');

  // ── Tier 4: Customers ────────────────────────────────────────────────────
  await del('customer_notes');
  await del('customer_invitations');
  await del('customers');
  // Only delete CUSTOMER-type users (guest accounts). Staff users are preserved.
  await del('users', `"account_type" = 'CUSTOMER'`);

  // ── Tier 5: Staff operational (NOT configuration) ────────────────────────
  await del('staff_attendance');
  await del('staff_leaves');
  await del('schedule_blocks');   // one-off blocks; staff_availabilities kept

  // ── Tier 6: Infrastructure / operational ─────────────────────────────────
  await del('schedule_guards');
  await del('idempotency_records');
  await del('webhook_inbox');
  await del('data_exports');
  await del('product_analytics_events');
  await del('reconciliation_incidents');
  await del('stripe_oauth_states');
  await del('google_oauth_states');
  await del('auth_rate_limits');

  // ── Tier 7: Email campaigns (templates preserved) ────────────────────────
  await del('email_campaigns');

  // ── Tier 8: Analytics ────────────────────────────────────────────────────
  await del('org_daily_metrics');
  await del('location_daily_metrics');
  await del('staff_daily_metrics');
  await del('service_daily_metrics');
  await del('waitlist_daily_metrics');

  // ── Tier 9: Audit logs ───────────────────────────────────────────────────
  await del('audit_logs');

  // ── Tier 10: Auth sessions (forces re-login for all staff) ───────────────
  await del('auth_refresh_tokens');
  await del('auth_sessions');

  // ── Tier 11: Token / verification tables ─────────────────────────────────
  await del('email_verification_tokens');
  await del('registration_requests');
  await del('mfa_challenges');

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(62));
  console.log(`  ✅  Complete! Total rows deleted: ${total}`);
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
  console.log('⚠️  All staff sessions wiped — everyone must log in again.');
  console.log('⚠️  Google Calendar connections preserved but may need');
  console.log('    re-authorization if tokens have expired.');
  console.log();
}

main()
  .catch((e) => {
    console.error('\n✗ Fatal error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
