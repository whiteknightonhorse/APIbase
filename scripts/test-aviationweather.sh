#!/usr/bin/env bash
# Smoke test for NOAA Aviation Weather Center (UC-575)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"
  if [ "$result" = "ok" ]; then
    echo "PASS: $desc"; PASS=$((PASS+1))
  else
    echo "FAIL: $desc — $result"; FAIL=$((FAIL+1))
  fi
}

# 1. Health check
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = 'ready' ] && echo ok || echo "status=$STATUS")"

# 2. Provider tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json
d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='aviationweather']
print(len(n))
" 2>/dev/null)
check "4 aviationweather tools in catalog" "$([ "$COUNT" = '4' ] && echo ok || echo "found=$COUNT")"

# 3. Tool detail endpoints
for TID in metar taf pirep stations; do
  HTTP=$(curl -so /dev/null -w "%{http_code}" "$BASE/api/v1/tools/aviationweather.$TID")
  check "Tool detail aviationweather.$TID (200)" "$([ "$HTTP" = '200' ] && echo ok || echo "http=$HTTP")"
done

# 4. Schema populated on metar
SCHEMA_OK=$(curl -s "$BASE/api/v1/tools/aviationweather.metar" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print('ok' if 'ids' in props else 'missing-ids')
" 2>/dev/null)
check "METAR schema has ids property" "$SCHEMA_OK"

# 5. Live API calls (if TEST_API_KEY set)
if [ -n "${TEST_API_KEY:-}" ]; then
  METAR_R=$(curl -s -X POST "$BASE/api/v1/tools/aviationweather.metar/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"ids":"KJFK"}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
r=d.get('result',d)
print('ok' if r.get('count',0)>0 else 'empty')
" 2>/dev/null)
  check "METAR live call KJFK" "$METAR_R"

  STATIONS_R=$(curl -s -X POST "$BASE/api/v1/tools/aviationweather.stations/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"state":"CA"}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
r=d.get('result',d)
print('ok' if r.get('count',0)>0 else 'empty')
" 2>/dev/null)
  check "Stations live call state=CA" "$STATIONS_R"
else
  echo "SKIP: Live API calls (set TEST_API_KEY to enable)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
