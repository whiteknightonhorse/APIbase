#!/usr/bin/env bash
# Smoke test for Eurostat SDMX 2.1 (UC-542)
set -uo pipefail

API="https://apibase.pro"
PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL $label: $result"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Eurostat SDMX 2.1 (UC-542) Smoke Test ==="

# 1. Health
echo "1/5 Health check..."
HEALTH=$(curl -sf "$API/health/ready" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d['status']=='ready' else 'bad')" 2>&1)
check "health" "$HEALTH"

# 2. Tools in catalog
echo "2/5 Tools in catalog..."
CATALOG=$(curl -sf "$API/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
eust=[t for t in d['data'] if t['provider']=='eurostat2']
print('ok' if len(eust)==5 else f'got {len(eust)}')
" 2>&1)
check "5 tools in catalog" "$CATALOG"

# 3. Tool details have input_schema
echo "3/5 Tool detail endpoints..."
for tool in eurostat2.fertility eurostat2.ghg_emissions eurostat2.rd_spending eurostat2.renewable_energy eurostat2.youth_employment; do
  DETAIL=$(curl -sf "$API/api/v1/tools/$tool" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no schema')
" 2>&1)
  check "detail $tool" "$DETAIL"
done

# 4. Eurostat SDMX 2.1 API live check
echo "4/5 Upstream API reachable..."
UPSTREAM=$(curl -sf "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/demo_find/A.TOTFERRT.DE?format=JSON&startPeriod=2022" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if len(d.get('value',{}))>0 else 'no data')
" 2>&1)
check "Eurostat SDMX 2.1 upstream" "$UPSTREAM"

# 5. Dashboard entry
echo "5/5 Dashboard entry..."
DASH=$(curl -sf "$API/api/v1/dashboard" | python3 -c "
import sys,json; d=json.load(sys.stdin)
m=[p for p in d['providers'] if p['provider']=='eurostat2']
print('ok' if m and m[0]['tool_count']==5 else 'not found')
" 2>&1)
check "dashboard eurostat2" "$DASH"

echo ""
echo "=== Results: ${PASS} PASS, ${FAIL} FAIL ==="
[ "${FAIL}" -eq 0 ] && echo "All tests passed!" || exit 1
