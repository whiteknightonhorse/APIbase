#!/bin/bash
# Smoke test for Frankfurter.dev adapter (UC-516)
set -e

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"; local expect="$3"
  if echo "$result" | grep -q "$expect"; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc (expected '$expect')"; echo "  Got: ${result:0:100}"; FAIL=$((FAIL+1))
  fi
}

echo "=== Frankfurter.dev Smoke Tests (UC-516) ==="

# 1. Health check
echo "1. Health check..."
check "Health ready" "$(curl -s $BASE/health/ready)" '"status":"ready"'

# 2. Tool catalog
echo "2. Tool catalog..."
TOOLS=$(curl -s "$BASE/api/v1/tools")
check "frankfurter.latest in catalog" "$TOOLS" "frankfurter.latest"
check "frankfurter.historical in catalog" "$TOOLS" "frankfurter.historical"
check "frankfurter.series in catalog" "$TOOLS" "frankfurter.series"
check "frankfurter.currencies in catalog" "$TOOLS" "frankfurter.currencies"

# 3. Tool detail endpoints
echo "3. Tool detail endpoints..."
check "frankfurter.latest detail" "$(curl -s $BASE/api/v1/tools/frankfurter.latest)" "input_schema"
check "frankfurter.historical detail" "$(curl -s $BASE/api/v1/tools/frankfurter.historical)" "input_schema"
check "frankfurter.series detail" "$(curl -s $BASE/api/v1/tools/frankfurter.series)" "input_schema"
check "frankfurter.currencies detail" "$(curl -s $BASE/api/v1/tools/frankfurter.currencies)" "input_schema"

# 4. Input schema has properties
echo "4. Input schema populated..."
LATEST_SCHEMA=$(curl -s $BASE/api/v1/tools/frankfurter.latest)
check "frankfurter.latest has base param" "$LATEST_SCHEMA" '"base"'
check "frankfurter.historical has date param" "$(curl -s $BASE/api/v1/tools/frankfurter.historical)" '"date"'
check "frankfurter.series has start_date param" "$(curl -s $BASE/api/v1/tools/frankfurter.series)" '"start_date"'

# 5. Live API calls (requires payment — check for 402 or result)
echo "5. Live API calls (402 = correct pipeline)..."
if [ -n "$SMOKE_TEST_KEY" ]; then
  CALL=$(curl -s -X POST $BASE/api/v1/tools/frankfurter.latest/call \
    -H "Authorization: Bearer $SMOKE_TEST_KEY" \
    -H "Content-Type: application/json" \
    -d '{"base":"EUR","symbols":"USD"}')
  check "frankfurter.latest call hits pipeline" "$CALL" '"error":'
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "ALL PASS" && exit 0 || exit 1
