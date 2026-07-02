#!/usr/bin/env bash
# Test script for Orphadata (UC-581)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
PASS=0; FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== Orphadata Smoke Tests (UC-581) ==="
echo "Target: $API_URL"
echo ""

# 1. Health check
echo "1/5 Health check..."
STATUS=$(curl -s "$API_URL/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && pass "health/ready = ready" || fail "health/ready = $STATUS"

# 2. Orphadata tools in catalog
echo "2/5 Orphadata tools in catalog..."
COUNT=$(curl -s "$API_URL/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
tools=[t for t in d['data'] if t['id'].startswith('orphadata.')]
print(len(tools))
")
[ "$COUNT" = "4" ] && pass "$COUNT orphadata tools found" || fail "expected 4, got $COUNT"

# 3. Tool detail endpoints
echo "3/5 Tool detail endpoints..."
for TOOL in disease_lookup disease_epidemiology disease_phenotypes disease_natural_history; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/orphadata.$TOOL")
  [ "$HTTP" = "200" ] && pass "orphadata.$TOOL → HTTP 200" || fail "orphadata.$TOOL → HTTP $HTTP"
done

# 4. Schema validation
echo "4/5 Schema validation (input_schema populated)..."
SCHEMA=$(curl -s "$API_URL/api/v1/tools/orphadata.disease_lookup" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props = t.get('input_schema',{}).get('properties',{})
print(len(props))
")
[ "$SCHEMA" -ge "1" ] && pass "disease_lookup schema has $SCHEMA properties" || fail "disease_lookup schema empty"

# 5. Live API call (requires TEST_API_KEY and balance)
echo "5/5 Live API call (disease_lookup: Marfan syndrome)..."
if [ -n "${TEST_API_KEY:-}" ]; then
  RESP=$(curl -s -X POST "$API_URL/api/v1/tools/orphadata.disease_lookup/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"name": "Marfan syndrome"}')
  CODE=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('orphacode',''))")
  [ "$CODE" = "558" ] && pass "disease_lookup(Marfan) → orphacode=558" || fail "disease_lookup error: $RESP"
else
  echo "  SKIP: TEST_API_KEY not set"
fi

echo ""
echo "=== Results: Passed $PASS, Failed $FAIL ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
