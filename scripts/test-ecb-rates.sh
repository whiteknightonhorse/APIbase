#!/bin/bash
# Smoke test for ECB Data Portal (UC-595)
# Tests: health, catalog presence, tool details, live upstream API calls

set -e
BASE="https://apibase.pro"
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

echo "=== ECB Data Portal Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='ecb-rates']
print(len(n))
" 2>/dev/null)
check "4 ecb-rates tools in catalog" "$([ "$COUNT" = "4" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
for TOOL in ecb-rates.key_rates ecb-rates.hicp_inflation ecb-rates.money_supply ecb-rates.yield_curve; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
  check "$TOOL schema populated" "$HAS_SCHEMA"
done

# 4. Live upstream API calls (ECB Data Portal, no auth needed)
KEY_RATE=$(curl -s "https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?lastNObservations=1&format=jsondata" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('dataSets') and d['dataSets'][0].get('series') else 'bad_response')
" 2>/dev/null)
check "ECB key rates API live (deposit facility)" "$KEY_RATE"

HICP=$(curl -s "https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR?lastNObservations=1&format=jsondata" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('dataSets') and d['dataSets'][0].get('series') else 'bad_response')
" 2>/dev/null)
check "ECB HICP inflation API live" "$HICP"

M3=$(curl -s "https://data-api.ecb.europa.eu/service/data/BSI/M.U2.Y.V.M30.X.1.U2.2300.Z01.E?lastNObservations=1&format=jsondata" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('dataSets') and d['dataSets'][0].get('series') else 'bad_response')
" 2>/dev/null)
check "ECB M3 money supply API live" "$M3"

YC=$(curl -s "https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y?lastNObservations=1&format=jsondata" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('dataSets') and d['dataSets'][0].get('series') else 'bad_response')
" 2>/dev/null)
check "ECB yield curve API live (10Y)" "$YC"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ] && echo "ALL PASS" || exit 1
