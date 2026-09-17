#!/bin/sh
set -e

echo "Running BookPro production database migrations..."
npx prisma migrate deploy --schema=prisma/schema.prisma

echo "Database migrations completed successfully."
