-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IdempotencyStatus') THEN
        CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
    END IF;
END $$;

-- AlterTable idempotency_records
ALTER TABLE "idempotency_records"
    ADD COLUMN IF NOT EXISTS "operation" TEXT NOT NULL DEFAULT 'DEFAULT',
    ADD COLUMN IF NOT EXISTS "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    ADD COLUMN IF NOT EXISTS "error_message" TEXT,
    ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "status_code" DROP NOT NULL,
    ALTER COLUMN "response_body" DROP NOT NULL;

-- Update existing records to COMPLETED
UPDATE "idempotency_records"
SET "status" = 'COMPLETED'
WHERE "status" = 'IN_PROGRESS' AND "response_body" IS NOT NULL;

-- Drop old unique constraint on idempotency_records
DROP INDEX IF EXISTS "idempotency_records_organization_id_idempotency_key_key";
ALTER TABLE "idempotency_records" DROP CONSTRAINT IF EXISTS "idempotency_records_organization_id_idempotency_key_key";

-- Create new compound unique index on (organization_id, operation, idempotency_key)
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_records_organization_id_operation_idempotency_key_key"
ON "idempotency_records"("organization_id", "operation", "idempotency_key");

-- Create index on expires_at for janitor queries
CREATE INDEX IF NOT EXISTS "idempotency_records_expires_at_idx"
ON "idempotency_records"("expires_at");

-- Update booking_holds idempotency key scoping
DROP INDEX IF EXISTS "booking_holds_idempotency_key_key";
CREATE UNIQUE INDEX IF NOT EXISTS "booking_holds_organization_id_idempotency_key_key"
ON "booking_holds"("organizationId", "idempotency_key")
WHERE "idempotency_key" IS NOT NULL;

-- Create unique index on appointments.booking_hold_id (1:1 hold conversion guarantee)
CREATE UNIQUE INDEX IF NOT EXISTS "appointments_booking_hold_id_key"
ON "appointments"("booking_hold_id")
WHERE "booking_hold_id" IS NOT NULL;
