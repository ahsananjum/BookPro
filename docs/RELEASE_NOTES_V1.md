# BookPro v1 portfolio release notes

This document summarizes the current portfolio snapshot for review. It does not represent a published GitHub release or a claim of commercial service availability.

## Product

BookPro supports public appointment booking and separate customer and business workspaces. The domain covers organizations, locations, services, staff, work schedules, resources, booking holds, appointments, payments, customer records, and related operations.

## Engineering

- A Next.js web app and NestJS API share TypeScript contracts and validation packages in a pnpm/Turborepo workspace.
- Prisma maps the PostgreSQL schema and migrations.
- Server-side availability accounts for business hours, timezones, staff availability, buffers, booked intervals, capacity, and resources.
- Persisted booking holds, idempotency, and schedule guard buckets coordinate concurrent booking operations.
- Redis supports caching, queue transport, and tenant-scoped server-sent event delivery. A separate NestJS worker handles outbox notifications, calendar sync, and periodic cleanup.
- API guards enforce authentication, route permissions, tenant matching, and location scope.

## Integrations

The code includes provider adapters for Stripe, Google Calendar, Gemini, Brevo transactional email, and Twilio SMS. Provider use requires external configuration; the local environment template defaults optional providers off.

## Validation coverage

Jest tests cover API and worker behavior, including availability, booking authority, tenant authorization, payment/refund handling, AI role isolation, realtime, and notification adapters. The web package contains a Playwright smoke test. The repository does not currently track a separate API integration suite; the existing integration script references a configuration file that is absent from the tracked tree.

## Limitations

- The public Vercel demo does not expose authenticated business and customer workspaces without an appropriate account and configured data.
- Provider-dependent workflows cannot be exercised end-to-end without provider credentials and test accounts.
- The repository does not include a reusable demo-data seed script or a license file.
- The production environment, operational monitoring, and provider setup are external to this source tree.
- Test coverage is focused on selected domain and API scenarios; it is not exhaustive across every workflow or browser state.
- Lint configuration is incomplete across workspaces, and the web ESLint preset dependency is missing. The CI lint step needs repair before the workflow can be considered green.
- Captured product images show the deployed public experience; authenticated workspace screens require demo data/account access that the public deployment does not provide.
