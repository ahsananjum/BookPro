ALTER TABLE "organizations"
  ADD COLUMN "stripe_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stripe_payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stripe_details_submitted" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "organizations_stripe_account_id_key" ON "organizations"("stripe_account_id");

CREATE TABLE "stripe_oauth_states" (
  "id" UUID NOT NULL,
  "nonce_hash" TEXT NOT NULL,
  "organization_id" UUID NOT NULL,
  "actor_id" TEXT NOT NULL,
  "return_path" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stripe_oauth_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stripe_oauth_states_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "stripe_oauth_states_nonce_hash_key" ON "stripe_oauth_states"("nonce_hash");
CREATE INDEX "stripe_oauth_states_organization_id_expires_at_idx" ON "stripe_oauth_states"("organization_id", "expires_at");
CREATE INDEX "stripe_oauth_states_expires_at_idx" ON "stripe_oauth_states"("expires_at");
