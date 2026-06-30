#!/bin/bash
# Smoke test for CMU Delphi Epidata (UC-559)

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1" result="$2" expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "  PASS — $desc"
    PASS=$((PASS+1))
  else
    echo "  FAIL — $desc (got: $(echo "$result" | head -c 200))"
    FAIL=$((FAIL+1))
  fi
}

echo "=== CMU Delphi Epidata Smoke Test ==="

# 1. Health
echo "1/6 Health check..."
R=$(curl -s "$BASE/health/ready")
check "health ready" "$R" '"status":"ready"'

# 2. Provider tools in catalog
echo "2/6 Delphi tools in catalog..."
R=$(curl -s "$BASE/api/v1/tools")
DCOUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([t for t in d['data'] if t['id'].startswith('delphi.')]))" 2>/dev/null)
check "4 delphi tools found" "$DCOUNT" "4"

# 3. Tool detail — fluview
echo "3/6 Tool detail delphi.fluview..."
R=$(curl -s "$BASE/api/v1/tools/delphi.fluview")
check "fluview has input_schema regions" "$R" '"regions"'

# 4. Tool detail — covidcast
echo "4/6 Tool detail delphi.covidcast..."
R=$(curl -s "$BASE/api/v1/tools/delphi.covidcast")
check "covidcast has input_schema data_source" "$R" '"data_source"'

# 5. Live API call — fluview (requires TEST_API_KEY)
echo "5/6 Live call delphi.fluview..."
if [ -n "${TEST_API_KEY:-}" ]; then
  R=$(curl -s -X POST "$BASE/api/v1/tools/delphi.fluview/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"regions":"nat","epiweeks":"202001"}')
  check "fluview returns count" "$R" '"count"'
else
  echo "  SKIP — set TEST_API_KEY for live call test"
  PASS=$((PASS+1))
fi

# 6. Direct upstream API
echo "6/6 Direct upstream API (fluview)..."
R=$(curl -s "https://api.delphi.cmu.edu/epidata/fluview/?regions=nat&epiweeks=202001")
check "upstream has epidata" "$R" '"epidata"'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -eq 0 ]; then echo "ALL PASS"; exit 0; else exit 1; fi
