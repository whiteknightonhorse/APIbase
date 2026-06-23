#!/usr/bin/env bash
# Smoke test for Global Fishing Watch (UC-497)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"; PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc — $result"; FAIL=$((FAIL + 1))
  fi
}

echo "=== GFW Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print('ok' if json.load(sys.stdin).get('status')=='ready' else 'fail')")
check "Health check" "$STATUS"

# 2. GFW tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([t for t in d['data'] if t['id'].startswith('gfw.')]))")
check "GFW tools in catalog (expect 4)" "$([ "$COUNT" = "4" ] && echo ok || echo "got $COUNT")"

# 3. Tool details have schema
for TOOL in gfw.vessel.search gfw.vessel.details gfw.vessel.fishing_events gfw.ocean.fishing_effort; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "import sys,json; t=json.load(sys.stdin); print('ok' if t.get('input_schema',{}).get('properties') else 'no-schema')")
  check "$TOOL has input_schema" "$HAS_SCHEMA"
done

# 4. Live API call (vessel search)
if [ -n "${TEST_API_KEY:-}" ]; then
  VESSEL_RESULT=$(curl -s -X POST "$BASE/api/v1/tools/gfw.vessel.search/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"query":"Atlantic","limit":2}' | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result',{}); print('ok' if isinstance(r.get('vessels'), list) else f'bad: {list(r.keys())}')" 2>/dev/null || echo "error")
  check "Live vessel search call" "$VESSEL_RESULT"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && exit 0 || exit 1
