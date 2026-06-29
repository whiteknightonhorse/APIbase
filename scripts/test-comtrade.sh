#!/usr/bin/env bash
# Smoke test for UN Comtrade adapter (UC-534)
set -euo pipefail

BASE="https://apibase.pro"
API_KEY="${TEST_API_KEY:-}"
PASS=0; FAIL=0

ok()  { echo "  PASS $1"; PASS=$((PASS+1)); }
fail(){ echo "  FAIL $1: $2"; FAIL=$((FAIL+1)); }

echo "=== UN Comtrade (UC-534) smoke tests ==="

# 1. Health
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health/ready")
[ "$CODE" = "200" ] && ok "health" || fail "health" "HTTP $CODE"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
found=[t for t in d['data'] if t['id'].startswith('comtrade.')]
print(len(found))
")
[ "$COUNT" = "4" ] && ok "catalog: 4 comtrade tools" || fail "catalog" "found $COUNT tools, expected 4"

# 3. Tool detail endpoints
for tool in comtrade.trade_data comtrade.availability comtrade.metadata comtrade.reporters; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$tool")
  [ "$CODE" = "200" ] && ok "detail/$tool" || fail "detail/$tool" "HTTP $CODE"
done

# 4. Schema populated
SCHEMA=$(curl -s "$BASE/api/v1/tools/comtrade.trade_data" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print(len(props))
")
[ "$SCHEMA" -ge "5" ] && ok "schema: $SCHEMA params on comtrade.trade_data" || fail "schema" "only $SCHEMA params"

# 5. Live call (requires API key)
if [ -n "$API_KEY" ]; then
  RESP=$(curl -s -X POST "$BASE/api/v1/tools/comtrade.reporters/call" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"search": "germany"}' 2>/dev/null)
  COUNT_RESP=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('count',0))" 2>/dev/null || echo 0)
  [ "$COUNT_RESP" -ge "1" ] && ok "live call: comtrade.reporters search=germany → $COUNT_RESP result(s)" \
    || fail "live call" "unexpected response: $RESP"
else
  echo "  SKIP live API call (set TEST_API_KEY to enable)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq "0" ] && exit 0 || exit 1
