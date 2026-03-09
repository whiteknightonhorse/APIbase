#!/usr/bin/env bash
# APIbase.pro — Deploy & Rollback Script (§12.222)
#
# Deploys a specific commit SHA to production.
# On smoke test failure, automatically rolls back to the last successful SHA.
#
# Usage:
#   ./scripts/deploy.sh <commit-sha>
#
# Requirements:
#   - Docker Compose available
#   - App at /home/apibase/apibase
#   - scripts/smoke-test.sh available
#   - GHCR images already pushed for the given SHA
set -euo pipefail

NEW_SHA="${1:?Usage: deploy.sh <commit-sha>}"
APP_DIR="/home/apibase/apibase"
COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
LAST_GOOD_FILE="${APP_DIR}/.last-successful-sha"
READINESS_TIMEOUT=60
READINESS_INTERVAL=2
HEALTH_URL="http://127.0.0.1:8880"

cd "$APP_DIR"

echo "[deploy] Starting deploy: sha-${NEW_SHA}"

# ---------------------------------------------------------------------------
# Pull latest code
# ---------------------------------------------------------------------------
echo "[deploy] Pulling latest code"
git fetch origin main
git reset --hard "origin/main"

# ---------------------------------------------------------------------------
# Pull new images from GHCR
# ---------------------------------------------------------------------------
export IMAGE_TAG="sha-${NEW_SHA}"
echo "[deploy] Pulling images: IMAGE_TAG=${IMAGE_TAG}"
$COMPOSE_CMD pull api worker outbox-worker 2>/dev/null || {
  echo "[deploy] GHCR pull failed, building locally"
  docker build -t "ghcr.io/whiteknightonhorse/apibase:${IMAGE_TAG}" -f docker/Dockerfile .
  docker tag "ghcr.io/whiteknightonhorse/apibase:${IMAGE_TAG}" "ghcr.io/whiteknightonhorse/apibase:latest"
}

# ---------------------------------------------------------------------------
# Restart application containers (5-10s downtime — Phase 1)
# ---------------------------------------------------------------------------
echo "[deploy] Restarting application containers"
$COMPOSE_CMD up -d api worker outbox-worker

# Restart nginx to refresh DNS for new API container
$COMPOSE_CMD restart nginx

# ---------------------------------------------------------------------------
# Wait for readiness
# ---------------------------------------------------------------------------
echo "[deploy] Waiting for health/ready (timeout: ${READINESS_TIMEOUT}s)"
ELAPSED=0
READY=false
while [ "$ELAPSED" -lt "$READINESS_TIMEOUT" ]; do
  if curl -sf "${HEALTH_URL}/health/ready" > /dev/null 2>&1; then
    READY=true
    break
  fi
  sleep "$READINESS_INTERVAL"
  ELAPSED=$((ELAPSED + READINESS_INTERVAL))
done

if [ "$READY" = "false" ]; then
  echo "[deploy] ERROR: health/ready not responding after ${READINESS_TIMEOUT}s"
  # Fall through to rollback
fi

# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------
echo "[deploy] Running smoke tests"
if [ "$READY" = "true" ] && API_URL="${HEALTH_URL}" ./scripts/smoke-test.sh; then
  echo "${NEW_SHA}" > "$LAST_GOOD_FILE"
  echo "[deploy] SUCCESS: sha-${NEW_SHA} deployed and verified"
  exit 0
fi

# ---------------------------------------------------------------------------
# Rollback on failure
# ---------------------------------------------------------------------------
if [ -f "$LAST_GOOD_FILE" ]; then
  PREV_SHA=$(cat "$LAST_GOOD_FILE")
  echo "[deploy] FAIL: rolling back to sha-${PREV_SHA}"
  export IMAGE_TAG="sha-${PREV_SHA}"
  $COMPOSE_CMD pull api worker outbox-worker 2>/dev/null || true
  $COMPOSE_CMD up -d api worker outbox-worker
  $COMPOSE_CMD restart nginx

  # Wait for rollback readiness
  ELAPSED=0
  while [ "$ELAPSED" -lt "$READINESS_TIMEOUT" ]; do
    if curl -sf "${HEALTH_URL}/health/ready" > /dev/null 2>&1; then
      echo "[deploy] Rollback to sha-${PREV_SHA} ready"
      break
    fi
    sleep "$READINESS_INTERVAL"
    ELAPSED=$((ELAPSED + READINESS_INTERVAL))
  done
else
  echo "[deploy] FAIL: no previous SHA to rollback to"
fi

exit 1
