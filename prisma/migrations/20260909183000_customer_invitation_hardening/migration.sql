-- CreateIndex
CREATE INDEX IF NOT EXISTS "customer_invitations_organizationId_status_expiresAt_idx" ON "customer_invitations"("organizationId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customer_invitations_organizationId_email_status_idx" ON "customer_invitations"("organizationId", "email", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "customers_organizationId_userId_idx" ON "customers"("organizationId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_organization_id_dedupe_key_idx" ON "notifications"("organization_id", "dedupe_key");

-- Functional Lower-Case Indexes for Safe Case-Insensitive Email Matching
CREATE INDEX IF NOT EXISTS "customer_invitations_org_lower_email_status_idx" ON "customer_invitations"("organizationId", lower("email"), "status");

CREATE INDEX IF NOT EXISTS "customers_org_lower_email_idx" ON "customers"("organizationId", lower("email"));
