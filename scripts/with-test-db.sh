#!/usr/bin/env bash
# T-0681: run any command against a disposable Postgres 16.2 (Docker) with a pg_dump 16 shim.
# Usage: bash scripts/with-test-db.sh <command...>
# Exports TEST_DATABASE_URL (random 127.0.0.1 port) and PG_DUMP (shim running pg_dump from the same image).
# TEST_REDIS_URL is left as the caller set it. Reads no production database settings and no dotenv file.
set -u

IMAGE="postgres:16.2-alpine"
NAME="apibase-testdb-$$"

if [ "$#" -eq 0 ]; then
  echo "usage: with-test-db.sh <command...>" >&2
  exit 2
fi
command -v docker >/dev/null || { echo "with-test-db: docker not found" >&2; exit 5; }

SHIM_DIR=""
# shellcheck disable=SC2329 # invoked by trap
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  [ -n "$SHIM_DIR" ] && rm -rf "$SHIM_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Remove stale containers of this wrapper (name prefix only) older than 3 h.
NOW="$(date +%s)"
for c in $(docker ps -a --filter name='^apibase-testdb-' --format '{{.Names}}'); do
  created="$(docker inspect -f '{{.Created}}' "$c" 2>/dev/null || true)"
  ts="$(date -d "$created" +%s 2>/dev/null || echo "$NOW")"
  if [ $((NOW - ts)) -gt 10800 ]; then docker rm -f "$c" >/dev/null 2>&1 || true; fi
done

docker run -d --rm --name "$NAME" -p 127.0.0.1::5432 \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=apibase_test \
  "$IMAGE" >/dev/null || { echo "with-test-db: cannot start container" >&2; exit 5; }

READY=0
for _ in $(seq 1 60); do
  # TCP check: the image's init phase listens on the unix socket only.
  if docker exec "$NAME" pg_isready -h 127.0.0.1 -U test -d apibase_test >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
[ "$READY" = 1 ] || { echo "with-test-db: postgres not ready within 60 s" >&2; exit 5; }

PORT="$(docker port "$NAME" 5432/tcp | head -n1 | sed 's/.*://')"
[ -n "$PORT" ] || { echo "with-test-db: cannot resolve host port" >&2; exit 5; }

SHIM_DIR="$(mktemp -d)"
cat >"$SHIM_DIR/pg_dump" <<SHIM
#!/bin/sh
exec docker run --rm -i --network host $IMAGE pg_dump "\$@"
SHIM
chmod +x "$SHIM_DIR/pg_dump"

export TEST_DATABASE_URL="postgresql://test:test@127.0.0.1:${PORT}/apibase_test"
export PG_DUMP="$SHIM_DIR/pg_dump"

"$@"
exit $?
