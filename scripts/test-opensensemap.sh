#!/usr/bin/env bash
# Smoke test for OpenSenseMap integration (UC-504)
set -euo pipefail

BASE="https://apibase.pro"
PROVIDER="opensensemap"
PASS=0; FAIL=0

check() {
  local name="$1" result="$2" expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "  PASS  $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $name"
    echo "        Expected: $expected"
    echo "        Got: $(echo "$result" | head -c 200)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== OpenSenseMap Smoke Tests ==="

# 1. Health
check "Health" "$(curl -s $BASE/health/ready)" "ready"

# 2. Tool count includes opensensemap (4 tools)
TOOLS=$(curl -s "$BASE/api/v1/tools")
check "Tool catalog has opensensemap tools" "$TOOLS" "opensensemap.box_search"

OSMCOUNT=$(echo "$TOOLS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('opensensemap.')))")
check "4 opensensemap tools present" "$OSMCOUNT" "4"

# 3. Tool detail - box_search has input schema
DETAIL=$(curl -s "$BASE/api/v1/tools/opensensemap.box_search")
check "box_search has input schema" "$DETAIL" "latitude"
check "box_search has description" "$DETAIL" "PDDL"

# 4. Tool detail - sensor_timeseries has input schema
DETAIL2=$(curl -s "$BASE/api/v1/tools/opensensemap.sensor_timeseries")
check "sensor_timeseries has sensor_id param" "$DETAIL2" "sensor_id"

# 5. Dashboard shows opensensemap
DASH=$(curl -s "$BASE/api/v1/dashboard")
check "Dashboard shows opensensemap" "$DASH" "opensensemap"
check "Dashboard shows 4 tools" "$DASH" '"tool_count":4'

# 6. Live API call (if TEST_API_KEY is set)
if [ -n "${TEST_API_KEY:-}" ]; then
  RESULT=$(curl -s -X POST "$BASE/api/v1/tools/opensensemap.box_search/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"latitude": 52.52, "longitude": 13.40, "max_distance": 3000, "limit": 3}')
  check "box_search live call returns stations" "$RESULT" "stations"
else
  echo "  SKIP  Live call (TEST_API_KEY not set)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && exit 0 || exit 1
