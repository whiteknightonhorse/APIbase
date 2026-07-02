#!/bin/bash
# Smoke test for Bright Sky DWD integration (UC-570)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1" result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS  $label"; PASS=$((PASS+1))
  else
    echo "  FAIL  $label — $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== Bright Sky DWD (UC-570) smoke test ==="

# 1. Health
STATUS=$(curl -sf "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "error")
check "Health check" "$([ "$STATUS" = "ready" ] && echo ok || echo "status=$STATUS")"

# 2. Tools in catalog (expect 4)
COUNT=$(curl -sf "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
bs=[t for t in d['data'] if t['id'].startswith('brightsky')]
print(len(bs))
" 2>/dev/null || echo "0")
check "4 brightsky tools in catalog" "$([ "$COUNT" = "4" ] && echo ok || echo "count=$COUNT")"

# 3. Tool detail with schema (brightsky.current)
SCHEMA_OK=$(curl -sf "$BASE/api/v1/tools/brightsky.current" | python3 -c "
import sys,json; t=json.load(sys.stdin)
ok = bool(t.get('input_schema',{}).get('properties'))
print('ok' if ok else 'no_schema')
" 2>/dev/null || echo "error")
check "brightsky.current has input_schema" "$SCHEMA_OK"

# 4. Tool detail with schema (brightsky.observations)
SCHEMA_OK2=$(curl -sf "$BASE/api/v1/tools/brightsky.observations" | python3 -c "
import sys,json; t=json.load(sys.stdin)
ok = bool(t.get('input_schema',{}).get('properties'))
print('ok' if ok else 'no_schema')
" 2>/dev/null || echo "error")
check "brightsky.observations has input_schema" "$SCHEMA_OK2"

# 5. Live API call — brightsky.current (Berlin)
if [ -n "${TEST_API_KEY:-}" ]; then
  CURRENT=$(curl -sf -X POST "$BASE/api/v1/tools/brightsky.current/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"latitude":52.52,"longitude":13.40}' | python3 -c "
import sys,json; r=json.load(sys.stdin)
ok = r.get('temperature_c') is not None or 'condition' in r
print('ok' if ok else 'missing_fields')
" 2>/dev/null || echo "error")
  check "brightsky.current live call (Berlin)" "$CURRENT"

  # 6. Live call — brightsky.alerts
  ALERTS=$(curl -sf -X POST "$BASE/api/v1/tools/brightsky.alerts/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"latitude":52.52,"longitude":13.40}' | python3 -c "
import sys,json; r=json.load(sys.stdin)
ok = 'alerts' in r and 'location' in r
print('ok' if ok else 'missing_fields')
" 2>/dev/null || echo "error")
  check "brightsky.alerts live call (Berlin)" "$ALERTS"

  # 7. Live call — brightsky.stations
  STATIONS=$(curl -sf -X POST "$BASE/api/v1/tools/brightsky.stations/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"latitude":48.14,"longitude":11.58}' | python3 -c "
import sys,json; r=json.load(sys.stdin)
ok = r.get('count',0) > 0
print('ok' if ok else 'no_stations')
" 2>/dev/null || echo "error")
  check "brightsky.stations live call (Munich)" "$STATIONS"
else
  echo "  SKIP  Live API calls (set TEST_API_KEY to enable)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
