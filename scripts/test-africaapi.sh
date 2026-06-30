#!/usr/bin/env bash
# Smoke test for Africa API (UC-546)
set -euo pipefail
BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local name="$1" result="$2" expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "  PASS $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL $name (expected: $expected)"
    echo "       got: $(echo "$result" | head -c 200)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Africa API (UC-546) Smoke Test ==="

# 1. Health
R=$(curl -s --max-time 10 "$BASE/health/ready")
check "health" "$R" "ready"

# 2. Africa tools in catalog
R=$(curl -s --max-time 15 "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
africa=[t for t in d['data'] if t['id'].startswith('africa.')]
print(f'africa_tools={len(africa)}')
" 2>/dev/null)
check "catalog:africa_count" "$R" "africa_tools=5"

# 3. Tool details (input_schema populated)
for TOOL in africa.countries.list africa.countries.signals africa.markets.fx_rates africa.data.indicator africa.politics.elections; do
  R=$(curl -s --max-time 10 "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
has_schema=bool(t.get('input_schema',{}).get('properties'))
print(f'has_schema={has_schema}')
" 2>/dev/null)
  check "detail:$TOOL" "$R" "has_schema=True"
done

# 4. Tool call (402 payment required = pipeline wired correctly)
R=$(curl -s --max-time 15 -X POST "$BASE/api/v1/tools/africa.countries.list/call" \
  -H "Authorization: Bearer fake_key_for_smoke_test" \
  -H "Content-Type: application/json" \
  -d '{}')
check "call:payment_gate" "$R" "unauthorized\|payment_required"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && echo "africa: ALL PASS" || exit 1
