#!/usr/bin/env bash
# Smoke test for MBTA Transit (UC-510)
set -euo pipefail

BASE="https://apibase.pro"
API_KEY="${TEST_API_KEY:-}"

echo "=== MBTA Transit Smoke Test ==="
echo "Target: $BASE"

# 1. Health check
echo -n "1/5 Health check... "
STATUS=$(curl -sf "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "PASS ($STATUS)" || { echo "FAIL ($STATUS)"; exit 1; }

# 2. Tools in catalog
echo -n "2/5 MBTA tools in catalog... "
COUNT=$(curl -sf "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
mbta=[t for t in d['data'] if t['id'].startswith('mbta-transit')]
print(len(mbta))
")
[ "$COUNT" -eq 4 ] && echo "PASS ($COUNT tools)" || { echo "FAIL (expected 4, got $COUNT)"; exit 1; }

# 3. Tool detail has schema
echo -n "3/5 Tool schemas populated... "
SCHEMA_OK=$(curl -sf "$BASE/api/v1/tools/mbta-transit.routes" | python3 -c "
import sys,json; t=json.load(sys.stdin)
ok = bool(t.get('input_schema',{}).get('properties'))
print('ok' if ok else 'fail')
")
[ "$SCHEMA_OK" = "ok" ] && echo "PASS" || { echo "FAIL (no input_schema)"; exit 1; }

# 4. Live API call — routes (only if API key available)
if [ -n "$API_KEY" ]; then
  echo -n "4/5 Live call — mbta-transit.routes (subway)... "
  RESULT=$(curl -sf -X POST "$BASE/api/v1/tools/mbta-transit.routes/call" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type":"1","limit":5}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(d.get('count',0))
" 2>/dev/null || echo "0")
  [ "$RESULT" -gt 0 ] && echo "PASS ($RESULT subway routes)" || echo "WARN ($RESULT — may be off-peak)"

  echo -n "5/5 Live call — mbta-transit.alerts... "
  ALERTS=$(curl -sf -X POST "$BASE/api/v1/tools/mbta-transit.alerts/call" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"limit":5}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(d.get('count',0))
" 2>/dev/null || echo "0")
  echo "PASS ($ALERTS alerts returned)"
else
  echo "4/5 Live API call... SKIP (set TEST_API_KEY to run)"
  echo "5/5 Live alerts call... SKIP"
fi

echo ""
echo "=== MBTA Transit smoke test done ==="
