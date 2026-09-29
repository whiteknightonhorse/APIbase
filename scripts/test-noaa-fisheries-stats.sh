#!/bin/bash
# Smoke test for NOAA Fisheries Stats (FOSS) — noaa-fisheries-stats (UC-797)
# Tests: health, catalog presence, tool details, live upstream API calls

set -e
BASE="${BASE:-https://apibase.pro}"
FOSS="https://apps-st.fisheries.noaa.gov/ods/foss"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc — $result"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== noaa-fisheries-stats Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='noaa-fisheries-stats']
print(len(n))
" 2>/dev/null)
check "3 noaa-fisheries-stats tools in catalog" "$([ "$COUNT" = "3" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
for TOOL in noaa-fisheries-stats.landings noaa-fisheries-stats.survey_species noaa-fisheries-stats.survey_catch; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
  check "$TOOL schema populated" "$HAS_SCHEMA"
done

# 4. Live upstream API calls (NOAA FOSS ODS REST, no auth needed)
for TABLE in landings afsc_groundfish_survey_species afsc_groundfish_survey_catch; do
  LIVE=$(curl -s "$FOSS/$TABLE/?limit=1" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('items') else 'bad_response')
" 2>/dev/null)
  check "FOSS $TABLE live" "$LIVE"
done

# 5. Live tool execution (requires TEST_API_KEY)
if [ -n "${TEST_API_KEY:-}" ]; then
  EXEC=$(curl -s -X POST "$BASE/api/v1/tools/noaa-fisheries-stats.landings/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"species":"salmon","state":"Alaska","limit":2}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('data',{}).get('landings') else 'bad_response: ' + json.dumps(d))
" 2>/dev/null)
  check "landings live execution" "$EXEC"
else
  echo "  SKIP: live execution tests (TEST_API_KEY not set)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
