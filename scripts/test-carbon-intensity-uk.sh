#!/usr/bin/env bash
# Smoke test for UK National Grid Carbon Intensity (UC-513)
set -euo pipefail

BASE="https://apibase.pro"
PROVIDER="carbon-intensity-uk"
TOOLS=("carbonintensity.current" "carbonintensity.generation" "carbonintensity.regional" "carbonintensity.forecast")
PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label — $result"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Carbon Intensity UK Smoke Test ==="

# 1. Health
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "fail")
check "Health check" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ci=[t for t in d['data'] if t['id'].startswith('carbonintensity.')]
print(len(ci))
" 2>/dev/null || echo "0")
check "4 tools in catalog" "$([ "$COUNT" = "4" ] && echo ok || echo "got $COUNT")"

# 3. Each tool detail endpoint
for TOOL in "${TOOLS[@]}"; do
  STATUS=$(curl -s "${BASE}/api/v1/tools/${TOOL}" | python3 -c "import sys,json; t=json.load(sys.stdin); print('ok' if t.get('id')=='${TOOL}' else 'bad')" 2>/dev/null || echo "fail")
  check "Tool detail: ${TOOL}" "$STATUS"
done

# 4. Upstream API directly
INTENSITY=$(curl -s "https://api.carbonintensity.org.uk/intensity" | python3 -c "
import sys,json; d=json.load(sys.stdin)
v=d['data'][0]['intensity']['forecast']
print('ok' if isinstance(v, int) else 'bad')
" 2>/dev/null || echo "fail")
check "Upstream /intensity live" "$INTENSITY"

GENERATION=$(curl -s "https://api.carbonintensity.org.uk/generation" | python3 -c "
import sys,json; d=json.load(sys.stdin)
mix=d['data']['generationmix']
print('ok' if len(mix) >= 9 else 'bad')
" 2>/dev/null || echo "fail")
check "Upstream /generation live" "$GENERATION"

REGIONAL=$(curl -s "https://api.carbonintensity.org.uk/regional" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=len(d['data'][0]['regions'])
print('ok' if n >= 14 else f'only {n} regions')
" 2>/dev/null || echo "fail")
check "Upstream /regional live (14+ regions)" "$REGIONAL"

FORECAST=$(curl -s "https://api.carbonintensity.org.uk/intensity/fw24h" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=len(d['data'])
print('ok' if n >= 40 else f'only {n} periods')
" 2>/dev/null || echo "fail")
check "Upstream /intensity/fw24h (40+ periods)" "$FORECAST"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ "$FAIL" = "0" ] && exit 0 || exit 1
