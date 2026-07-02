#!/bin/bash
# APIbase — NBI Smoke Test (UC-569)
# Tests National Bridge Inventory tools
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
PASS=0; FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== NBI Bridges Smoke Test (UC-569) ==="
echo "Target: $API_URL"
echo ""

# 1. Health
echo "1/5 Health check..."
STATUS=$(curl -s "$API_URL/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
[ "$STATUS" = "ready" ] && pass "health ready" || fail "health: $STATUS"

# 2. Tools in catalog
echo "2/5 NBI tools in catalog..."
COUNT=$(curl -s "$API_URL/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
nbi=[t for t in d['data'] if t['id'].startswith('nbi.')]
print(len(nbi))
")
[ "$COUNT" = "4" ] && pass "4 NBI tools in catalog" || fail "expected 4, got $COUNT"

# 3. Tool schemas
echo "3/5 Schema validation..."
PROPS=$(curl -s "$API_URL/api/v1/tools/nbi.search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=list(t.get('input_schema',{}).get('properties',{}).keys())
print(','.join(sorted(props)))
")
[ "$PROPS" = "condition,limit,state_code" ] && pass "nbi.search schema correct" || fail "props: $PROPS"

# 4. Description not empty
echo "4/5 Rich descriptions..."
DESC=$(curl -s "$API_URL/api/v1/tools/nbi.condition_stats" | python3 -c "
import sys,json; t=json.load(sys.stdin); print(len(t.get('description','')))
")
[ "$DESC" -gt "50" ] && pass "nbi.condition_stats has rich description ($DESC chars)" || fail "description too short: $DESC"

# 5. Auth gate (401 expected for bad key)
echo "5/5 Auth gate (401 expected for bad key)..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/v1/tools/nbi.search/call" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ak_live_badkey000000000000000000000000" \
  -d '{"state_code":"06"}')
[ "$CODE" = "401" ] && pass "correct 401 for invalid key" || fail "expected 401, got $CODE"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "ALL PASS" && exit 0 || exit 1
