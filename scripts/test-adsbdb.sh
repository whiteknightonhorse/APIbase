#!/usr/bin/env bash
# Smoke test for ADS-B DB (UC-529)
set -uo pipefail
BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS  $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL  $desc — $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== ADS-B DB smoke test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health check" "$( [ "$STATUS" = "ready" ] && echo ok || echo "status=$STATUS" )"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='adsbdb']
print(len(n))
" 2>/dev/null)
check "3 adsbdb tools in catalog" "$( [ "$COUNT" = "3" ] && echo ok || echo "count=$COUNT" )"

# 3. Tool detail endpoints
for tool in aircraft_lookup airline_lookup callsign_lookup; do
  HTTP=$(curl -so /dev/null -w "%{http_code}" "$BASE/api/v1/tools/adsbdb.$tool")
  check "Tool detail adsbdb.$tool" "$( [ "$HTTP" = "200" ] && echo ok || echo "http=$HTTP" )"
done

# 4. Live API: aircraft by Mode-S
AIRCRAFT=$(curl -s "https://api.adsbdb.com/v0/aircraft/400F6B" | python3 -c "
import sys,json; d=json.load(sys.stdin)
a=d.get('response',{}).get('aircraft',{})
print('ok' if a.get('mode_s')=='400F6B' else 'unexpected')
" 2>/dev/null)
check "Live aircraft lookup (Mode-S 400F6B)" "$AIRCRAFT"

# 5. Live API: airline by ICAO
AIRLINE=$(curl -s "https://api.adsbdb.com/v0/airline/BAW" | python3 -c "
import sys,json; d=json.load(sys.stdin)
airlines=d.get('response',[])
print('ok' if airlines and airlines[0]['icao']=='BAW' else 'unexpected')
" 2>/dev/null)
check "Live airline lookup (BAW)" "$AIRLINE"

# 6. Live API: callsign route
CALLSIGN=$(curl -s "https://api.adsbdb.com/v0/callsign/BAW123" | python3 -c "
import sys,json; d=json.load(sys.stdin)
r=d.get('response',{}).get('flightroute',{})
print('ok' if r.get('callsign')=='BAW123' else 'unexpected')
" 2>/dev/null)
check "Live callsign lookup (BAW123)" "$CALLSIGN"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
