#!/usr/bin/env bash
# test-checkwx.sh — Smoke tests for CheckWX Aviation Weather adapter (UC-423)
set -euo pipefail

BASE="${API_BASE:-https://apibase.pro}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name — $result"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== CheckWX Aviation Weather Smoke Tests (UC-423) ==="

# 1. Health check
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/health/ready")
check "Health check" "$([ "$STATUS" = "200" ] && echo ok || echo "HTTP $STATUS")"

# 2. CheckWX tools in catalog
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
checkwx=[t for t in d['data'] if t['id'].startswith('checkwx.')]
print(len(checkwx))
")
check "CheckWX tools in catalog (expect 3)" "$([ "$COUNT" = "3" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail endpoints (200, input_schema present)
for TOOL in checkwx.metar_decoded checkwx.taf_decoded checkwx.station_info; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/v1/tools/${TOOL}")
  check "Tool detail: ${TOOL}" "$([ "$STATUS" = "200" ] && echo ok || echo "HTTP $STATUS")"

  HAS_SCHEMA=$(curl -s "${BASE}/api/v1/tools/${TOOL}" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print('ok' if props else 'no-schema')
")
  check "Input schema: ${TOOL}" "$HAS_SCHEMA"
done

# 4. Live API calls (requires TEST_API_KEY env var)
if [ -n "${TEST_API_KEY:-}" ]; then
  echo ""
  echo "  [live] Running live API calls with TEST_API_KEY..."

  # METAR decoded
  HTTP=$(curl -s -o /tmp/cwx_metar.json -w "%{http_code}" \
    -X POST "${BASE}/api/v1/tools/checkwx.metar_decoded/call" \
    -H "Authorization: Bearer ${TEST_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"icao_codes":"KJFK"}')
  check "Live METAR decoded (KJFK)" "$([ "$HTTP" = "200" ] && echo ok || echo "HTTP $HTTP")"

  # TAF decoded
  HTTP=$(curl -s -o /tmp/cwx_taf.json -w "%{http_code}" \
    -X POST "${BASE}/api/v1/tools/checkwx.taf_decoded/call" \
    -H "Authorization: Bearer ${TEST_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"icao_codes":"KSFO"}')
  check "Live TAF decoded (KSFO)" "$([ "$HTTP" = "200" ] && echo ok || echo "HTTP $HTTP")"

  # Station info
  HTTP=$(curl -s -o /tmp/cwx_station.json -w "%{http_code}" \
    -X POST "${BASE}/api/v1/tools/checkwx.station_info/call" \
    -H "Authorization: Bearer ${TEST_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"icao_code":"EGLL"}')
  check "Live station info (EGLL)" "$([ "$HTTP" = "200" ] && echo ok || echo "HTTP $HTTP")"
else
  echo "  [skip] TEST_API_KEY not set — skipping live API calls"
fi

echo ""
echo "=== Results: Passed=$PASS Failed=$FAIL ==="
[ "$FAIL" = "0" ] && exit 0 || exit 1
