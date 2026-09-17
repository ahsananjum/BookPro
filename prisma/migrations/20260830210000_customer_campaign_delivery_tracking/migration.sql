ALTER TABLE "email_campaigns"
  ADD COLUMN "delivered_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failed_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "notifications"
  ADD COLUMN "email_campaign_id" UUID,
  ADD COLUMN "campaign_counted_at" TIMESTAMPTZ(6);

CREATE INDEX "notifications_email_campaign_id_status_idx"
  ON "notifications"("email_campaign_id", "status");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_email_campaign_id_fkey"
  FOREIGN KEY ("email_campaign_id") REFERENCES "email_campaigns"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
