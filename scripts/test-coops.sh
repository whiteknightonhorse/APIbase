#!/bin/bash
# Smoke test for NOAA CO-OPS Tides & Currents (UC-567)

BASE="https://apibase.pro"
PROVIDER="coops"
PASS=0; FAIL=0

echo "=== NOAA CO-OPS Tides & Currents Smoke Test ==="

# 1. Health check
echo -n "1/5 Health check... "
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
if [ "$STATUS" = "ready" ]; then echo "PASS"; PASS=$((PASS+1)); else echo "FAIL ($STATUS)"; FAIL=$((FAIL+1)); fi

# 2. Tools in catalog
echo -n "2/5 Tools in catalog (expect 4)... "
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
tools = [t for t in d['data'] if t['id'].startswith('${PROVIDER}.')]
print(len(tools))
" 2>/dev/null)
if [ "$COUNT" = "4" ]; then echo "PASS (4 tools)"; PASS=$((PASS+1)); else echo "FAIL (expected 4, got $COUNT)"; FAIL=$((FAIL+1)); fi

# 3. Tool detail endpoints return 200
echo -n "3/5 Tool detail endpoints (200)... "
ALL_OK=true
for TOOL in "coops.predictions" "coops.water_level" "coops.stations" "coops.conditions"; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  if [ "$HTTP" != "200" ]; then ALL_OK=false; echo "FAIL ($TOOL returned $HTTP)"; FAIL=$((FAIL+1)); break; fi
done
if $ALL_OK; then echo "PASS (4/4 detail endpoints 200)"; PASS=$((PASS+1)); fi

# 4. Input schema populated on coops.predictions
echo -n "4/5 Input schema populated... "
PROPS=$(curl -s "$BASE/api/v1/tools/coops.predictions" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
" 2>/dev/null)
if [ "${PROPS:-0}" -ge "3" ] 2>/dev/null; then echo "PASS ($PROPS params)"; PASS=$((PASS+1)); else echo "FAIL (expected >=3 props, got $PROPS)"; FAIL=$((FAIL+1)); fi

# 5. Live API call — 401 (no auth) or 402 (payment) confirms pipeline is active
echo -n "5/5 Pipeline active (expect 401 or 402)... "
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/tools/coops.stations/call" \
  -H "Content-Type: application/json" \
  -d '{"limit":3}')
if [ "$HTTP" = "401" ] || [ "$HTTP" = "402" ]; then echo "PASS ($HTTP = pipeline active)"; PASS=$((PASS+1)); else echo "FAIL (expected 401 or 402, got $HTTP)"; FAIL=$((FAIL+1)); fi

echo ""
echo "=== Results: $PASS/5 PASS, $FAIL/5 FAIL ==="
[ $FAIL -eq 0 ] && echo "ALL PASS" || exit 1
