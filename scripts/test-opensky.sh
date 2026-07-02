#!/bin/bash
# Smoke test for OpenSky Network ADS-B integration (UC-566)
set -e

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc — $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== OpenSky Network ADS-B smoke tests ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. OpenSky tools in catalog (expect 4)
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['id'].startswith('opensky.')]))
" 2>/dev/null)
check "4 OpenSky tools in catalog" "$([ "$COUNT" = "4" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail endpoints
for TOOL in opensky.states_bbox opensky.aircraft_state opensky.states_country opensky.aircraft_track; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  check "Tool detail $TOOL (200)" "$([ "$HTTP" = "200" ] && echo ok || echo "HTTP $HTTP")"
done

# 4. states_bbox live call (requires TEST_API_KEY)
if [ -n "$TEST_API_KEY" ]; then
  RESULT=$(curl -s -X POST "$BASE/api/v1/tools/opensky.states_bbox/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"lamin":47.0,"lomin":5.0,"lamax":55.0,"lomax":15.0,"limit":5}' \
    | python3 -c "
import sys,json; d=json.load(sys.stdin)
r=d.get('result',{})
print('ok' if isinstance(r.get('aircraft'), list) else 'bad result: '+str(d)[:100])
" 2>/dev/null)
  check "states_bbox live call" "$RESULT"

  RESULT=$(curl -s -X POST "$BASE/api/v1/tools/opensky.states_country/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"country":"Germany","limit":5,"lamin":45.0,"lomin":5.0,"lamax":56.0,"lomax":16.0}' \
    | python3 -c "
import sys,json; d=json.load(sys.stdin)
r=d.get('result',{})
print('ok' if isinstance(r.get('aircraft'), list) else 'bad result: '+str(d)[:100])
" 2>/dev/null)
  check "states_country live call (Germany)" "$RESULT"
else
  echo "  SKIP: Live API calls (set TEST_API_KEY to enable)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
