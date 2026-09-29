#!/bin/bash
# Smoke test for World Bank WITS Trade & Tariffs — wits-trade (UC-796)
# Tests: health, catalog presence, tool details, live upstream API calls

set -e
BASE="${BASE:-https://apibase.pro}"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc — $result"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== wits-trade Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='wits-trade']
print(len(n))
" 2>/dev/null)
check "2 wits-trade tools in catalog" "$([ "$COUNT" = "2" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
for TOOL in wits-trade.trade_stats wits-trade.tariff_stats; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
  check "$TOOL schema populated" "$HAS_SCHEMA"
done

# 4. Live upstream API calls (wits.worldbank.org SDMX-JSON, no auth needed)
TRADE=$(curl -sL "https://wits.worldbank.org/API/V1/SDMX/V21/datasource/tradestats-trade/reporter/usa/year/2020/partner/wld/product/Total/indicator/XPRT-TRD-VL?format=JSON" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('dataSets') and d['dataSets'][0].get('series') else 'bad_response')
" 2>/dev/null)
check "WITS trade API live" "$TRADE"

TARIFF=$(curl -sL "https://wits.worldbank.org/API/V1/SDMX/V21/datasource/tradestats-tariff/reporter/usa/year/2020/partner/chn/product/Total/indicator/AHS-WGHTD-AVRG?format=JSON" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('dataSets') and d['dataSets'][0].get('series') else 'bad_response')
" 2>/dev/null)
check "WITS tariff API live" "$TARIFF"

# 5. Live tool execution (requires TEST_API_KEY)
if [ -n "${TEST_API_KEY:-}" ]; then
  EXEC=$(curl -s -X POST "$BASE/api/v1/tools/wits-trade.trade_stats/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"reporter":"usa","year":"2020"}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('data',{}).get('observations') else 'bad_response: ' + json.dumps(d))
" 2>/dev/null)
  check "trade_stats live execution" "$EXEC"
else
  echo "  SKIP: live execution tests (TEST_API_KEY not set)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
