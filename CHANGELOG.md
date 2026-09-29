# Changelog

## 1.0.0 — Portfolio release candidate

This entry describes the current portfolio snapshot; it is not a published GitHub release.

- Customer and staff-facing appointment booking with server-side availability, persisted holds, and appointment lifecycle management.
- Organization, location, service, staff, and resource scheduling with role, tenant, and location authorization boundaries.
- Stripe payments and refunds, analytics, customer records, waitlists, attendance/check-in, reviews, and commissions.
- Redis-backed realtime events and BullMQ background processing for notifications, calendar synchronization, and maintenance tasks.
- Gemini-assisted workflows mediated by application tools and shared validation contracts.
- pnpm/Turborepo monorepo with Next.js, NestJS, Prisma, PostgreSQL, Redis, Jest, Playwright, and GitHub Actions.

See [v1 release notes](docs/RELEASE_NOTES_V1.md) for the architecture, validation coverage, integrations, and limitations.
