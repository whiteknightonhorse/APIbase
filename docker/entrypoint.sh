#!/bin/sh
# APIbase.pro — Container entrypoint (§12.194)
#
# Startup sequence:
#   1. Wait for PG + Redis (handled by depends_on healthchecks)
#   2. Run migrations (API container only)
#   3. Run partition scripts (API container only)
#   4. exec into Node.js process (replaces shell for proper SIGTERM)

set -eu

SERVICE_NAME="${SERVICE_NAME:-api}"

echo "[entrypoint] Starting service: ${SERVICE_NAME}"

# Only the API container runs migrations and seeds (§12.194)
if [ "$SERVICE_NAME" = "api" ]; then
    echo "[entrypoint] Running Prisma migrations..."
    npx prisma migrate deploy

    echo "[entrypoint] Creating partitions..."
    # Partition creation is handled by the migration's DO block on first run.
    # Daily partition cron (§12.244) handles subsequent days.

    echo "[entrypoint] Migrations complete."
fi

# Replace shell with Node.js process for proper signal handling (§12.230)
echo "[entrypoint] Starting Node.js process..."
exec "$@"
