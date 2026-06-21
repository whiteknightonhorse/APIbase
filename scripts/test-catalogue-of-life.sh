#!/usr/bin/env bash
# Smoke test for Catalogue of Life integration (UC-492)

set +e
BASE="https://apibase.pro"
PASS=0; FAIL=0

ok() { echo "  PASS $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL $1: $2"; FAIL=$((FAIL+1)); }

echo "=== Catalogue of Life (UC-492) Smoke Tests ==="

# 1. Health check
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && ok "Health check" || fail "Health check" "$STATUS"

# 2. All 4 COL tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ids = [t['id'] for t in d['data'] if t['id'].startswith('col.')]
print(len(ids))
")
[ "$COUNT" = "4" ] && ok "COL tools in catalog ($COUNT/4)" || fail "COL tools in catalog" "found $COUNT/4"

# 3. Tool schema populated
PROPS=$(curl -s "$BASE/api/v1/tools/col.search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
")
[ "$PROPS" -ge 3 ] 2>/dev/null && ok "col.search schema ($PROPS props)" || fail "col.search schema" "only $PROPS props"

# 4. Tool detail endpoints return 200
for TOOL in col.search col.detail col.suggest col.children; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  [ "$HTTP" = "200" ] && ok "$TOOL detail (HTTP $HTTP)" || fail "$TOOL detail" "HTTP $HTTP"
done

# 5. Live call returns 402 payment required (correct pipeline behavior)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/tools/col.search/call" \
  -H "Authorization: Bearer ak_live_9b9978edba8a8c59f478837d0a660c9d" \
  -H "Content-Type: application/json" \
  -d '{"query": "Panthera leo"}')
[ "$HTTP" = "402" ] && ok "col.search pipeline (402 payment gate)" || fail "col.search pipeline" "HTTP $HTTP (expected 402)"

# 6. COL upstream API reachable
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "https://api.catalogueoflife.org/dataset/3/nameusage/search?q=Homo+sapiens&limit=1")
[ "$HTTP" = "200" ] && ok "COL upstream reachable" || fail "COL upstream" "HTTP $HTTP"

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ] && echo "=== All tests passed ===" || { echo "=== FAILURES DETECTED ==="; exit 1; }
