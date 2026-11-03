#!/usr/bin/env bash
# T-0681: tests for scripts/with-test-db.sh (needs docker).
# shellcheck disable=SC2015
set -u
cd "$(dirname "$0")/.." || exit 2
W="bash scripts/with-test-db.sh"
FAILS=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; FAILS=$((FAILS + 1)); }

OUT="$($W env 2>&1)"
echo "$OUT" | grep -q '^TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:[0-9]*/apibase_test$' && ok "1a url on 127.0.0.1" || bad "1a url"
PGD="$(echo "$OUT" | sed -n 's/^PG_DUMP=//p')"
[ -n "$PGD" ] && ok "1b PG_DUMP exported" || bad "1b PG_DUMP"

# shellcheck disable=SC2016
V="$($W sh -c '"$PG_DUMP" --version' 2>&1)"
echo "$V" | grep -q 'pg_dump (PostgreSQL) 16' && ok "2 shim reports 16 inside wrapped command: $V" || bad "2 shim version: $V"

[ -z "$(docker ps -a --filter name='^apibase-testdb-' -q)" ] && ok "3 no container remains" || bad "3 leftover container"
[ ! -e "$PGD" ] && ok "3b shim removed" || bad "3b shim left"

IMG_SCRIPT="$(sed -n 's/^IMAGE="\(.*\)"$/\1/p' scripts/with-test-db.sh)"
IMG_COMPOSE="$(grep -m1 'image: postgres:' docker-compose.yml | sed 's/.*image: *//')"
[ -n "$IMG_SCRIPT" ] && [ "$IMG_SCRIPT" = "$IMG_COMPOSE" ] && ok "4 image $IMG_SCRIPT == compose" || bad "4 image '$IMG_SCRIPT' vs '$IMG_COMPOSE'"

$W false; RC=$?
[ "$RC" = 1 ] && ok "5a exit code 1" || bad "5a exit code $RC"
[ -z "$(docker ps -a --filter name='^apibase-testdb-' -q)" ] && ok "5b cleaned up" || bad "5b leftover"

if [ "$FAILS" = 0 ]; then echo "ALL PASS"; else echo "$FAILS FAILED"; exit 1; fi
