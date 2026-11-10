#!/bin/bash
# T-0685 (0566 ruling-2, option C): the one task-callable way to swap the sandbox image.
#   sandbox-image.sh <tag>     run api/worker/outbox-worker of the sandbox stack on that local image tag
#   sandbox-image.sh restore   put back the image that was running before the first swap
# <tag> must be sha-<40 hex> or t<card>-<8 hex> AND already present in local `docker images`.
# Reads the sandbox env file itself (passed to compose only, never printed). The state file records
# the image ID that was running before the swap; a second swap keeps the original, so restore always
# returns to the pre-swap image. Health is checked after every swap and restore; a restore whose recorded
# image no longer boots falls back to the image prod (apibase-api-1) runs instead of leaving the sandbox down.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="ghcr.io/whiteknightonhorse/apibase"
PROJECT="apibase-sandbox"
PROBE="apibase-sandbox-api-1"
RESTORE_TAG="sandbox-restore"
STATE="$DIR/.sandbox-image-state"
ENVFILE="$DIR/.env.sandbox"
SERVICES=(api worker outbox-worker)

die() { echo "sandbox-image: $*" >&2; exit 1; }

[ "$#" -eq 1 ] || die "usage: sandbox-image.sh <tag>|restore"
ARG="$1"

up() { # $1 = tag
  [ -r "$ENVFILE" ] || die "sandbox env file is missing or unreadable"
  IMAGE_TAG="$1" docker compose -p "$PROJECT" -f "$DIR/docker-compose.sandbox.yml" \
    --env-file "$ENVFILE" up -d --no-deps "${SERVICES[@]}"
}

wait_healthy() { # polls the probe container every 3 s, up to ${SANDBOX_HEALTH_WAIT:-120} s
  local waited=0
  while :; do
    [ "$(docker inspect "$PROBE" --format '{{.State.Health.Status}}' 2>/dev/null || true)" = healthy ] && return 0
    [ "$waited" -ge "${SANDBOX_HEALTH_WAIT:-120}" ] && return 1
    sleep 3; waited=$((waited + 3))
  done
}

if [ "$ARG" = "restore" ]; then
  [ -s "$STATE" ] || die "no state file: nothing to restore"
  PREV="$(head -n1 "$STATE")"
  [[ "$PREV" =~ ^(sha256:)?[0-9a-f]{12,64}$ ]] || die "state file is corrupt"
  docker image inspect "$PREV" >/dev/null 2>&1 || die "previous image is no longer present locally"
  docker tag "$PREV" "$REPO:$RESTORE_TAG"
  up "$RESTORE_TAG"
  if wait_healthy; then
    rm -f "$STATE"
    echo "restored image $PREV"
    exit 0
  fi
  PROD="$(docker inspect apibase-api-1 --format '{{.Image}}' 2>/dev/null || true)"
  { [ -z "$PROD" ] || [ "$PROD" = "$PREV" ]; } && die "restore failed: recorded image unhealthy, no fallback"
  docker tag "$PROD" "$REPO:$RESTORE_TAG"
  up "$RESTORE_TAG"
  wait_healthy || die "restore failed: recorded image unhealthy, fallback unhealthy"
  rm -f "$STATE"
  echo "restore-fallback: recorded image $PREV unhealthy, sandbox now on prod image $PROD"
  exit 0
fi

[[ "$ARG" =~ ^(sha-[0-9a-f]{40}|t[0-9]+-[0-9a-f]{8})$ ]] || die "tag must match sha-<40hex> or t<card>-<sha8>"
docker image inspect "$REPO:$ARG" >/dev/null 2>&1 || die "tag $ARG is not present in local docker images"

[ -r "$ENVFILE" ] || die "sandbox env file is missing or unreadable"
if [ ! -s "$STATE" ]; then
  CUR="$(docker inspect "$PROBE" --format '{{.Image}}')"
  [ -n "$CUR" ] || die "cannot read the running sandbox image"
  printf '%s\n' "$CUR" > "$STATE"
fi
up "$ARG"
wait_healthy || die "$ARG did not become healthy"
echo "sandbox now on $ARG (previous: $(head -n1 "$STATE"))"
