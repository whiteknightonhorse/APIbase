#!/usr/bin/env bash
# Smoke test for Open Context adapter (UC-493)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
API_KEY="${TEST_API_KEY:-}"
PASSED=0
FAILED=0

pass() { echo "  PASS"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL: $1"; FAILED=$((FAILED + 1)); }

echo "=== Open Context smoke test (UC-493) ==="
echo "Target: $API_URL"

# 1. Health
echo -n "1/6 Health check..."
STATUS=$(curl -s "$API_URL/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
[ "$STATUS" = "ready" ] && pass || fail "health not ready: $STATUS"

# 2. Tool count in catalog
echo -n "2/6 Tools in catalog (expect 4)..."
COUNT=$(curl -s "$API_URL/api/v1/tools" | python3 -c "
import sys,json
d=json.load(sys.stdin)
oc=[t for t in d['data'] if t['id'].startswith('opencontext.')]
print(len(oc))
" 2>/dev/null)
[ "$COUNT" = "4" ] && pass || fail "expected 4 opencontext tools, got $COUNT"

# 3. Tool detail endpoints (schema populated)
echo -n "3/6 Tool detail endpoints (schema)..."
SCHEMA_OK=1
for TOOL in opencontext.search opencontext.detail opencontext.facets opencontext.projects; do
  PROPS=$(curl -s "$API_URL/api/v1/tools/$TOOL" | python3 -c "
import sys,json
t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
" 2>/dev/null)
  if [ "$PROPS" -lt "1" ] 2>/dev/null; then
    SCHEMA_OK=0
    echo -n " [$TOOL missing schema]"
  fi
done
[ "$SCHEMA_OK" = "1" ] && pass || fail "some tools missing input_schema properties"

# 4. Anonymous request returns 401 (auth before payment)
echo -n "4/6 Auth enforcement (no key → 401)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/v1/tools/opencontext.search/call" \
  -H "Content-Type: application/json" \
  -d '{"query": "pottery"}' 2>/dev/null)
[ "$HTTP_CODE" = "401" ] && pass || fail "expected 401, got $HTTP_CODE"

# 5. Live API calls (requires API key with balance)
echo -n "5/6 Live opencontext.search..."
if [ -n "$API_KEY" ]; then
  RESP=$(curl -s -X POST "$API_URL/api/v1/tools/opencontext.search/call" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d '{"query": "Roman pottery", "rows": 3}' 2>/dev/null)
  ITEMS=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('rows',0))" 2>/dev/null || echo "0")
  if [ "$ITEMS" -ge "1" ] 2>/dev/null; then
    echo "  PASS ($ITEMS items)"
    PASSED=$((PASSED + 1))
  else
    fail "got 0 items or error: $(echo $RESP | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("message","?"))' 2>/dev/null)"
  fi
else
  echo "  SKIP (no API_KEY)"
fi

# 6. Live facets call
echo -n "6/6 Live opencontext.facets..."
if [ -n "$API_KEY" ]; then
  RESP=$(curl -s -X POST "$API_URL/api/v1/tools/opencontext.facets/call" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d '{"query": "pottery"}' 2>/dev/null)
  TOTAL=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('total_results',0))" 2>/dev/null || echo "0")
  if [ "$TOTAL" -gt "0" ] 2>/dev/null; then
    echo "  PASS (total=$TOTAL)"
    PASSED=$((PASSED + 1))
  else
    fail "got 0 total or error: $(echo $RESP | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("message","?"))' 2>/dev/null)"
  fi
else
  echo "  SKIP (no API_KEY)"
fi

echo ""
echo "=== Results: $PASSED passed, $FAILED failed ==="
[ "$FAILED" = "0" ] && exit 0 || exit 1
