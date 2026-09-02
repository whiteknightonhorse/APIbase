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
# nginx's own exposed port -- every check below already goes THROUGH nginx, not
# straight to a backend container: only nginx has a host port mapping in
# docker-compose.yml, api/worker/outbox-worker do not.
HEALTH_URL="http://127.0.0.1:8880"
STATIC_RELEASES_DIR="${APP_DIR}/static-releases"
STATIC_LINK="${APP_DIR}/static-current"

cd "$APP_DIR"

echo "[deploy] Starting deploy: sha-${NEW_SHA}"

# ---------------------------------------------------------------------------
# F2 guard: never touch a dirty working tree
# ---------------------------------------------------------------------------
# This directory doubles as a live hands-on development workspace between
# deploys. An unconditional hard-reset here has already silently destroyed a
# session's uncommitted edits to 10 tracked files once (env.ts, app.ts,
# registry.ts, tool-definitions.ts, schemas/index.ts, cache.stage.ts,
# schema.prisma, tool_provider_config.yaml, content-moderation-classes.json,
# .env.example). Refuse instead of guessing which side "wins".
if [ -n "$(git status --porcelain)" ]; then
  echo "[deploy] ABORT: working tree has uncommitted changes -- refusing to touch it" >&2
  git status --porcelain >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Checkout the EXACT commit being deployed (F2 fix)
# ---------------------------------------------------------------------------
# Previously: `git fetch origin main && git reset --hard origin/main`, which
# checks out whatever origin/main happens to be AT THE MOMENT this script
# runs -- not necessarily $NEW_SHA. nginx.conf and static/ are bind-mounted
# straight from this working tree, so if a second promotion landed on main
# between this release's image build and this script running, nginx would
# serve a NEWER commit's config than the sha-$NEW_SHA images just pulled:
# two different releases running as one.
#
# Live incident this caused: curl /connect/device/vendors -> 404 in
# production for 40 minutes, because nginx.conf on disk was ahead of the
# running image. check-mount-nginx-parity.py stayed green throughout --
# it only ever compares router files to nginx/nginx.conf IN THE REPO, never
# the actually-served pair.
echo "[deploy] Checking out exact commit sha-${NEW_SHA}"
git fetch origin main
git checkout --detach "$NEW_SHA"

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

# Restart nginx: refreshes its cached DNS for the recreated API container,
# AND loads this commit's nginx.conf -- now guaranteed to match the images
# just started, thanks to the checkout step above. Static assets are
# deliberately NOT switched yet -- see the static-asset section below.
$COMPOSE_CMD restart nginx

# ---------------------------------------------------------------------------
# Wait for readiness
# ---------------------------------------------------------------------------
wait_ready() {
  local elapsed=0
  while [ "$elapsed" -lt "$READINESS_TIMEOUT" ]; do
    if curl -sf "${HEALTH_URL}/health/ready" > /dev/null 2>&1; then
      return 0
    fi
    sleep "$READINESS_INTERVAL"
    elapsed=$((elapsed + READINESS_INTERVAL))
  done
  return 1
}

echo "[deploy] Waiting for health/ready (timeout: ${READINESS_TIMEOUT}s)"
READY=false
if wait_ready; then
  READY=true
else
  echo "[deploy] ERROR: health/ready not responding after ${READINESS_TIMEOUT}s"
  # Fall through to rollback
fi

# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------
echo "[deploy] Running smoke tests"
SMOKE_OK=false
if [ "$READY" = "true" ] && API_URL="${HEALTH_URL}" ./scripts/smoke-test.sh; then
  SMOKE_OK=true
fi

if [ "$SMOKE_OK" = "true" ]; then
  # -------------------------------------------------------------------------
  # F2: switch static assets AFTER the smoke test passes, via a versioned
  # release dir + atomic symlink swap -- not live the instant `git checkout`
  # touched the (formerly) bind-mounted ./static directory. Rollback below
  # reverts this symlink too, so a bad release can never leave images and
  # static assets split across two different versions.
  # -------------------------------------------------------------------------
  echo "[deploy] Switching static assets to sha-${NEW_SHA}"
  mkdir -p "$STATIC_RELEASES_DIR"
  rm -rf "${STATIC_RELEASES_DIR:?}/${NEW_SHA}"
  cp -a "${APP_DIR}/static" "${STATIC_RELEASES_DIR}/${NEW_SHA}"
  touch "${STATIC_RELEASES_DIR}/${NEW_SHA}" # guarantee a fresh mtime for the retention sort below,
                                             # independent of `cp -a` preserving the source tree's
                                             # own timestamps
  ln -sfn "${STATIC_RELEASES_DIR}/${NEW_SHA}" "${STATIC_LINK}.tmp"
  mv -Tf "${STATIC_LINK}.tmp" "$STATIC_LINK"

  # Retention: keep the last 10 static releases. Without this, static-releases/ grows by one
  # full copy of static/ (~14MB today) per deploy forever -- the exact "partition never
  # dropped" shape F1 fixed for the DB, just relocated to disk-backed static assets instead.
  # 10 is generous rollback headroom; this is disk hygiene, not a security boundary.
  ls -t "$STATIC_RELEASES_DIR" 2>/dev/null | tail -n +11 | while IFS= read -r old_sha; do
    rm -rf "${STATIC_RELEASES_DIR:?}/${old_sha}"
  done

  # docker-compose.yml mounts ./static-current (a symlink). Docker resolves a
  # bind-mount source's symlink ONCE, at container-create time -- swapping
  # the symlink target alone does not move an already-running container's
  # mount. force-recreate so nginx actually picks up the new release.
  $COMPOSE_CMD up -d --force-recreate nginx

  if wait_ready; then
    echo "${NEW_SHA}" > "$LAST_GOOD_FILE"
    echo "[deploy] SUCCESS: sha-${NEW_SHA} deployed and verified (images + nginx.conf + static)"
    exit 0
  fi
  echo "[deploy] ERROR: nginx did not come back ready after the static-asset switch"
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

  # Roll nginx.conf back too -- checkout is cheap and this working tree is
  # guaranteed clean (checked above), so there is nothing to lose. Without
  # this, a rollback restores only the images and leaves nginx.conf on the
  # failed release: the exact "two versions running as one" this whole fix
  # exists to prevent, just relocated to the rollback path instead.
  git checkout --detach "$PREV_SHA" 2>/dev/null \
    || echo "[deploy] WARN: could not checkout sha-${PREV_SHA} -- nginx.conf may still be on the failed release"

  # Roll the static-asset symlink back with it. A pre-F2 deploy never
  # captured a versioned release dir, so an older PREV_SHA may have none --
  # best effort, disclosed rather than silently left on the failed release.
  if [ -d "${STATIC_RELEASES_DIR}/${PREV_SHA}" ]; then
    ln -sfn "${STATIC_RELEASES_DIR}/${PREV_SHA}" "${STATIC_LINK}.tmp"
    mv -Tf "${STATIC_LINK}.tmp" "$STATIC_LINK"
  else
    echo "[deploy] WARN: no versioned static release for sha-${PREV_SHA} (pre-dates this mechanism) -- static-current left as-is"
  fi

  $COMPOSE_CMD up -d --force-recreate nginx

  # Wait for rollback readiness
  if wait_ready; then
    echo "[deploy] Rollback to sha-${PREV_SHA} ready"
  else
    echo "[deploy] ERROR: rollback did not become ready either"
  fi
else
  echo "[deploy] FAIL: no previous SHA to rollback to"
fi

exit 1
