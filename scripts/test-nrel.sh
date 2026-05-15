#!/usr/bin/env bash
# Test script for NREL AFDC + PVWatts adapter (UC-414)
# Usage: TEST_API_KEY=ak_live_... bash scripts/test-nrel.sh

set -euo pipefail

BASE_URL="${BASE_URL:-https://apibase.pro}"
TEST_API_KEY="${TEST_API_KEY:-}"

echo "=== NREL AFDC + PVWatts Smoke Test (UC-414) ==="
echo "Target: ${BASE_URL}"
echo ""

# 1. Health check
echo "1/5 Health check..."
STATUS=$(curl -s "${BASE_URL}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
if [ "$STATUS" = "ready" ]; then
  echo "  PASS (status=$STATUS)"
else
  echo "  FAIL (status=$STATUS)"
  exit 1
fi

# 2. NREL tools in catalog
echo "2/5 NREL tools in catalog..."
NREL_COUNT=$(curl -s "${BASE_URL}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
nrel = [t for t in d['data'] if t['id'].startswith('nrel.')]
print(len(nrel))
for t in nrel:
    print(f'  {t[\"id\"]}')
")
echo "  NREL tools: $NREL_COUNT"
if [ "$(echo "$NREL_COUNT" | head -1)" = "4" ]; then
  echo "  PASS"
else
  echo "  FAIL (expected 4 tools)"
  exit 1
fi

# 3. Tool detail endpoints
echo "3/5 Tool detail endpoints..."
for TOOL_ID in nrel.afdc_stations_nearest nrel.afdc_stations_search nrel.afdc_station_detail nrel.pvwatts_estimate; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/v1/tools/${TOOL_ID}")
  if [ "$HTTP" = "200" ]; then
    echo "  PASS ${TOOL_ID} (200)"
  else
    echo "  FAIL ${TOOL_ID} (${HTTP})"
    exit 1
  fi
done

# 4. Input schema verification
echo "4/5 Input schema verification..."
PVWATTS_PROPS=$(curl -s "${BASE_URL}/api/v1/tools/nrel.pvwatts_estimate" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props = list(t.get('input_schema',{}).get('properties',{}).keys())
print(len(props))
print(props)
")
echo "  PVWatts props: $PVWATTS_PROPS"

# 5. Live API calls (if TEST_API_KEY provided)
if [ -n "$TEST_API_KEY" ]; then
  echo "5/5 Live API calls..."
  # AFDC nearest - San Francisco
  echo -n "  AFDC nearest (SF)... "
  NEAREST=$(curl -s -X POST "${BASE_URL}/api/v1/tools/nrel.afdc_stations_nearest/call" \
    -H "Authorization: Bearer ${TEST_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"latitude":37.7749,"longitude":-122.4194,"fuel_type":"ELEC","limit":2}')
  TOTAL=$(echo "$NEAREST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('total_results',0))" 2>/dev/null || echo "0")
  if [ "$TOTAL" -gt "0" ] 2>/dev/null; then
    echo "PASS (total_results=$TOTAL)"
  else
    echo "FAIL (no results or error: $(echo $NEAREST | head -c 200))"
  fi

  # PVWatts estimate
  echo -n "  PVWatts estimate... "
  PVWATTS=$(curl -s -X POST "${BASE_URL}/api/v1/tools/nrel.pvwatts_estimate/call" \
    -H "Authorization: Bearer ${TEST_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"latitude":37.7749,"longitude":-122.4194,"system_capacity":5}')
  AC=$(echo "$PVWATTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('annual',{}).get('ac_energy_kwh',0))" 2>/dev/null || echo "0")
  if [ "$(echo "$AC > 0" | python3 -c "import sys; print(eval(open('/dev/stdin').read().strip()))")" = "True" ] 2>/dev/null; then
    echo "PASS (ac_annual=${AC} kWh)"
  else
    echo "FAIL (no annual output: $(echo $PVWATTS | head -c 200))"
  fi
else
  echo "5/5 Live API calls... SKIP (set TEST_API_KEY=ak_live_... to enable)"
fi

echo ""
echo "=== NREL smoke test complete ==="
