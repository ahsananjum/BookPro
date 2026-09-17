DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountType') THEN
    CREATE TYPE "AccountType" AS ENUM ('ORGANIZATION', 'CUSTOMER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailCampaignStatus') THEN
    CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENT');
  END IF;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_type" "AccountType" NOT NULL DEFAULT 'ORGANIZATION';
UPDATE "users" SET "account_type" = 'CUSTOMER' WHERE EXISTS (SELECT 1 FROM "customers" c WHERE c."userId" = "users"."id") AND NOT EXISTS (SELECT 1 FROM "memberships" m WHERE m."userId" = "users"."id" AND m."status" = 'ACTIVE');
ALTER TABLE "email_verification_tokens" ALTER COLUMN "organization_id" DROP NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "organization_id" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "customer_invitations" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "createdBy" UUID,
  "accepted_by_id" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "customer_invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "customer_invitations_token_hash_key" ON "customer_invitations"("token_hash");
CREATE INDEX IF NOT EXISTS "customer_invitations_organizationId_status_idx" ON "customer_invitations"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "customer_invitations_email_idx" ON "customer_invitations"("email");

CREATE TABLE IF NOT EXISTS "organization_email_templates" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "html_body" TEXT NOT NULL,
  "text_body" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "organization_email_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_email_templates_organizationId_name_key" ON "organization_email_templates"("organizationId", "name");
CREATE INDEX IF NOT EXISTS "organization_email_templates_organizationId_idx" ON "organization_email_templates"("organizationId");

CREATE TABLE IF NOT EXISTS "email_campaigns" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "recipient_count" INTEGER NOT NULL DEFAULT 0,
  "sent_at" TIMESTAMPTZ(6),
  "createdBy" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "email_campaigns_organizationId_createdAt_idx" ON "email_campaigns"("organizationId", "createdAt");

ALTER TABLE "customer_invitations" ADD CONSTRAINT "customer_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_invitations" ADD CONSTRAINT "customer_invitations_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_email_templates" ADD CONSTRAINT "organization_email_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "organization_email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
