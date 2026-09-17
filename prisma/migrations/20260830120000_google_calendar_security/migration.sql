ALTER TABLE "google_calendar_connections" RENAME COLUMN "access_token" TO "encrypted_access_token";
ALTER TABLE "google_calendar_connections" ADD COLUMN "channel_token_hash" TEXT;
ALTER TABLE "google_calendar_connections" ADD COLUMN "last_message_number" BIGINT;

CREATE TABLE "google_oauth_states" (
  "id" UUID NOT NULL,
  "nonce_hash" TEXT NOT NULL,
  "organization_id" UUID NOT NULL,
  "staff_id" UUID NOT NULL,
  "actor_id" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "google_oauth_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "google_oauth_states_nonce_hash_key" ON "google_oauth_states"("nonce_hash");
CREATE INDEX "google_oauth_states_expires_at_idx" ON "google_oauth_states"("expires_at");

-- Existing access tokens were plaintext and cannot safely be treated as ciphertext.
UPDATE "google_calendar_connections" SET "encrypted_access_token" = NULL, "access_token_expires_at" = NULL;
