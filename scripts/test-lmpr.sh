#!/usr/bin/env bash
# USDA LMPR Datamart smoke test (UC-535)
# Tests: health, catalog, tool details, live API calls

set -euo pipefail
BASE="https://apibase.pro"
PASS=0; FAIL=0

ok()  { echo "[PASS] $1"; PASS=$((PASS+1)); }
fail(){ echo "[FAIL] $1"; FAIL=$((FAIL+1)); }

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "error")
[ "$STATUS" = "ready" ] && ok "Health ready" || fail "Health: $STATUS"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
t=[x for x in d['data'] if x['id'].startswith('lmpr.')]
print(len(t))
" 2>/dev/null)
[ "$COUNT" -eq 5 ] && ok "5 lmpr tools in catalog" || fail "Expected 5 lmpr tools, got $COUNT"

# 3. Tool detail endpoints
for TOOL in lmpr.cattle_slaughter_prices lmpr.hog_slaughter_prices lmpr.boxed_beef_cutout lmpr.dairy_product_prices lmpr.lamb_carcass_cutout; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  [ "$STATUS" = "200" ] && ok "Tool detail $TOOL" || fail "Tool detail $TOOL: HTTP $STATUS"
done

# 4. Schema populated
PROPS=$(curl -s "$BASE/api/v1/tools/lmpr.cattle_slaughter_prices" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
" 2>/dev/null)
[ "$PROPS" -ge 2 ] && ok "Schema has $PROPS properties" || fail "Schema missing properties: $PROPS"

# 5. Live API calls (require auth - 402 or result = tool works)
if [ -n "${TEST_API_KEY:-}" ]; then
  for TOOL in lmpr.cattle_slaughter_prices lmpr.hog_slaughter_prices lmpr.boxed_beef_cutout lmpr.dairy_product_prices lmpr.lamb_carcass_cutout; do
    RESP=$(curl -s -X POST "$BASE/api/v1/tools/$TOOL/call" \
      -H "Authorization: Bearer $TEST_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"all_sections":false}')
    HAS_RESULT=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'result' in d else 'no')" 2>/dev/null)
    [ "$HAS_RESULT" = "yes" ] && ok "Live call $TOOL" || fail "Live call $TOOL: $(echo $RESP | head -c 100)"
  done
else
  # Without key: check payment required (proof adapter is wired)
  RESP=$(curl -s -X POST "$BASE/api/v1/tools/lmpr.cattle_slaughter_prices/call" \
    -H "Authorization: Bearer ak_live_test000000000000000000000000" \
    -H "Content-Type: application/json" \
    -d '{}')
  CODE=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error_code','?'))" 2>/dev/null)
  [ "$CODE" = "PAYMENT_REQUIRED" ] || [ "$CODE" = "UNAUTHORIZED" ] && ok "Adapter wired (payment gate hit)" || fail "Unexpected response: $CODE"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
