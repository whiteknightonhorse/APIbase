#!/bin/bash
# Smoke test for Argentina Gov Series de Tiempo — indec-argentina (UC-776)
# Tests: health, catalog presence, tool details, live upstream API calls

set -e
BASE="${BASE:-https://apibase.pro}"
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

echo "=== indec-argentina Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='indec-argentina']
print(len(n))
" 2>/dev/null)
check "2 indec-argentina tools in catalog" "$([ "$COUNT" = "2" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
for TOOL in indec-argentina.search_series indec-argentina.get_series; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
  check "$TOOL schema populated" "$HAS_SCHEMA"
done

# 4. Live upstream API calls (apis.datos.gob.ar/series/api, no auth needed)
SEARCH=$(curl -s "https://apis.datos.gob.ar/series/api/search/?q=inflacion&limit=1" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if len(d.get('data',[])) > 0 else 'bad_response')
" 2>/dev/null)
check "Series de Tiempo search API live" "$SEARCH"

SERIES=$(curl -s "https://apis.datos.gob.ar/series/api/series/?ids=168.1_T_CAMBIOR_D_0_0_26&limit=1" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if len(d.get('data',[])) > 0 else 'bad_response')
" 2>/dev/null)
check "Series de Tiempo data API live" "$SERIES"

# 5. Live tool execution (requires TEST_API_KEY)
if [ -n "${TEST_API_KEY:-}" ]; then
  EXEC=$(curl -s -X POST "$BASE/api/v1/tools/indec-argentina.search_series/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"query":"tipo de cambio","limit":3}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('data',{}).get('results') else 'bad_response: ' + json.dumps(d))
" 2>/dev/null)
  check "search_series live execution" "$EXEC"
else
  echo "  SKIP: live execution tests (TEST_API_KEY not set)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
