#!/usr/bin/env bash
# Monthly restore drill: restore a plain-SQL gzip dump into a throwaway postgres container and sanity-check it.
# Usage: backup-restore-drill.sh [DUMP] [--report-dir DIR]
# Exit: 0 OK, 2 bad gzip, 3 restore failed, 4 verification failed, 5 environment problem.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$HERE")"
DUMP="$REPO/backups/last/apibase-latest.sql.gz"
REPORT_DIR="$REPO/backups/restore-drill"
while [ $# -gt 0 ]; do
  case "$1" in
    --report-dir) REPORT_DIR="${2:?--report-dir needs a value}"; shift 2 ;;
    *) DUMP="$1"; shift ;;
  esac
done

NAME="apibase-restore-drill-$$"
ERR="$(mktemp)"
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -f "$ERR"
}
trap cleanup EXIT

fail() { # code reason
  echo "RESTORE-DRILL FAIL $1 $2"
  exit "$1"
}

DUMP="$(realpath "$DUMP" 2>/dev/null || echo "$DUMP")"
gunzip -t "$DUMP" 2>/dev/null || fail 2 "dump is not a valid gzip"

command -v docker >/dev/null || fail 5 "docker not found"
DUMP_MTIME="$(stat -c %Y "$DUMP")"
DUMP_SHA="$(sha256sum "$DUMP" | cut -d' ' -f1)"
DUMP_SIZE="$(stat -c %s "$DUMP")"
SQL_SIZE="$(gunzip -c "$DUMP" | wc -c)"

T0="$(date +%s)"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=x -e POSTGRES_USER=apibase \
  -e POSTGRES_DB=apibase postgres:16-alpine >/dev/null 2>"$ERR" || fail 5 "cannot start container: $(tail -c 300 "$ERR")"

# TCP check: the image's init phase only listens on the unix socket, so this waits for the real server.
READY=0
for _ in $(seq 1 60); do
  if docker exec "$NAME" psql -h 127.0.0.1 -U apibase -d apibase -tAc 'SELECT 1' >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
[ "$READY" = 1 ] || fail 5 "postgres not ready after 60s"

# Plain dumps carry GRANTs but not roles; create every role the dump grants to (cluster roles survive in production).
for role in $(gunzip -c "$DUMP" | grep -oE '^(GRANT|ALTER DEFAULT PRIVILEGES).* TO [a-z_][a-z0-9_]*;' | sed -E 's/.* TO ([a-z_][a-z0-9_]*);/\1/' | sort -u); do
  [ "$role" = apibase ] || docker exec "$NAME" psql -q -U apibase -d apibase -c "CREATE ROLE $role" >/dev/null 2>&1 || true
done

if ! gunzip -c "$DUMP" | docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U apibase -d apibase >/dev/null 2>"$ERR"; then
  fail 3 "restore failed: $(tail -n 5 "$ERR" | tr '\n' ' ')"
fi
SECONDS_TAKEN=$(( $(date +%s) - T0 ))

q() { docker exec "$NAME" psql -U apibase -d apibase -tAc "$1"; }

TABLES="$(q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
REASON=""
[ "$TABLES" -ge 20 ] || REASON="only $TABLES tables in public (need >=20)"

declare -A ROWS
for t in agents execution_ledger shop_merchants tools; do
  ROWS[$t]="$(q "SELECT count(*) FROM public.$t" 2>/dev/null || echo 0)"
  [ "${ROWS[$t]}" -gt 0 ] || REASON="${REASON:+$REASON; }table $t is empty or missing"
done

LEDGER_MAX="$(q "SELECT coalesce(floor(extract(epoch FROM max(created_at)))::bigint, 0) FROM public.execution_ledger" 2>/dev/null || echo 0)"
if [ "$LEDGER_MAX" -lt $(( DUMP_MTIME - 48 * 3600 )) ]; then
  REASON="${REASON:+$REASON; }newest execution_ledger row is older than dump mtime minus 48h"
fi
[ "$SQL_SIZE" -gt 1048576 ] || REASON="${REASON:+$REASON; }unpacked dump is only $SQL_SIZE bytes (need >1 MB)"

if [ -n "$REASON" ]; then RESULT=FAIL; else RESULT=OK; fi

mkdir -p "$REPORT_DIR"
{
  echo "# Restore drill $(date -u +%F)"
  echo
  echo "- dump: $DUMP"
  echo "- sha256: $DUMP_SHA"
  echo "- size: $DUMP_SIZE bytes gzip, $SQL_SIZE bytes unpacked"
  echo "- restore time: ${SECONDS_TAKEN}s"
  echo "- public tables: $TABLES"
  echo "- result: $RESULT${REASON:+ ($REASON)}"
  echo
  echo "| table | rows |"
  echo "|---|---|"
  for t in agents execution_ledger shop_merchants tools; do echo "| $t | ${ROWS[$t]} |"; done
} > "$REPORT_DIR/$(date -u +%F).md"

[ "$RESULT" = OK ] || fail 4 "$REASON"
echo "RESTORE-DRILL OK $DUMP tables=$TABLES ledger_rows=${ROWS[execution_ledger]} seconds=$SECONDS_TAKEN"
