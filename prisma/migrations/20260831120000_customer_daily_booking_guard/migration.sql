-- Persist the organization-local booking date so the database can enforce one
-- active appointment per customer per day without relying on application races.
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "booking_date" DATE;
UPDATE "appointments" SET "booking_date" = ("startAt" AT TIME ZONE 'UTC')::date WHERE "booking_date" IS NULL;
ALTER TABLE "appointments" ALTER COLUMN "booking_date" SET NOT NULL;

CREATE OR REPLACE FUNCTION set_appointment_booking_date()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tz text;
BEGIN
  SELECT COALESCE(l."timezone", o."timezone", 'UTC') INTO tz
  FROM "locations" l JOIN "organizations" o ON o."id" = NEW."organizationId"
  WHERE l."id" = NEW."locationId";
  NEW."booking_date" := (NEW."startAt" AT TIME ZONE COALESCE(tz, 'UTC'))::date;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS appointments_set_booking_date ON "appointments";
CREATE TRIGGER appointments_set_booking_date
BEFORE INSERT OR UPDATE OF "startAt", "locationId", "organizationId" ON "appointments"
FOR EACH ROW EXECUTE FUNCTION set_appointment_booking_date();

CREATE INDEX IF NOT EXISTS "appointments_organizationId_customerId_booking_date_idx"
  ON "appointments" ("organizationId", "customerId", "booking_date");

-- Preserve the earliest active appointment when legacy data contains duplicates;
-- this makes the invariant enforceable without deleting customer history.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "organizationId", "customerId", "booking_date"
    ORDER BY "startAt", "createdAt", "id"
  ) AS rn
  FROM "appointments"
  WHERE "status" NOT IN ('CANCELLED', 'NO_SHOW')
)
UPDATE "appointments" a
SET "status" = 'CANCELLED', "updatedAt" = CURRENT_TIMESTAMP
FROM ranked r
WHERE a."id" = r."id" AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "appointments_one_active_customer_booking_per_day_idx"
  ON "appointments" ("organizationId", "customerId", "booking_date")
  WHERE "status" NOT IN ('CANCELLED', 'NO_SHOW');
