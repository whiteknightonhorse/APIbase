#!/bin/bash
# Smoke test for Open-Meteo Air Quality (UC-555)
set -e

BASE="https://apibase.pro"
PROVIDER="openmeteoaq"
TOOLS=4

echo "=== Open-Meteo Air Quality Smoke Test ==="

# 1. Health check
echo -n "1/5 Health... "
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL ($STATUS)"; exit 1; }

# 2. Provider tools visible in catalog
echo -n "2/5 Tools in catalog... "
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
tools=[t for t in d['data'] if t['provider']=='$PROVIDER']
print(len(tools))
")
[ "$COUNT" = "$TOOLS" ] && echo "PASS ($COUNT tools)" || { echo "FAIL (expected $TOOLS, got $COUNT)"; exit 1; }

# 3. Tool detail — input schema populated
echo -n "3/5 Schema populated... "
HAS=$(curl -s "$BASE/api/v1/tools/openmeteoaq.current" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print('ok' if 'latitude' in props and 'longitude' in props else 'missing')
")
[ "$HAS" = "ok" ] && echo "PASS" || { echo "FAIL ($HAS)"; exit 1; }

# 4. All tool endpoints return 200 (tool detail)
echo -n "4/5 Tool details (4x)... "
FAIL=0
for TOOL in openmeteoaq.current openmeteoaq.forecast openmeteoaq.historical openmeteoaq.pollen; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  [ "$CODE" = "200" ] || { echo "FAIL: $TOOL returned $CODE"; FAIL=1; }
done
[ "$FAIL" = "0" ] && echo "PASS" || exit 1

# 5. Live call returns 402 (payment required — proves adapter is wired correctly)
echo -n "5/5 Live call (402 payment required)... "
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/tools/openmeteoaq.current/call" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SMOKE_TEST_KEY}" \
  -d '{"latitude":48.8566,"longitude":2.3522}')
[ "$CODE" = "402" ] && echo "PASS (402 — payment pipeline active)" || { echo "FAIL (expected 402, got $CODE)"; exit 1; }

echo ""
echo "=== All 5/5 Open-Meteo Air Quality tests PASSED ==="
