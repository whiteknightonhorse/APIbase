#!/usr/bin/env bash
# Smoke test for UC-583: ADB Key Indicators Database (KIDB)
# Usage: TEST_API_KEY=ak_live_... bash scripts/test-adbkidb.sh

set -euo pipefail

BASE="https://apibase.pro/api/v1/tools"
KEY="${TEST_API_KEY:-${SMOKE_TEST_KEY:-}}"

if [[ -z "$KEY" ]]; then
  echo "ERROR: Set TEST_API_KEY or SMOKE_TEST_KEY"
  exit 1
fi

AUTH="Authorization: Bearer $KEY"
CT="Content-Type: application/json"
PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  local expect="$3"
  if echo "$result" | grep -q "$expect"; then
    echo "  PASS: $label"
    ((PASS++)) || true
  else
    echo "  FAIL: $label — expected '$expect' in: $result"
    ((FAIL++)) || true
  fi
}

echo "=== ADB KIDB Smoke Tests ==="

echo ""
echo "1. adbkidb.dataflows_list (static)"
R=$(curl -sf "$BASE/adbkidb.dataflows_list/call" -H "$AUTH" -H "$CT" -d '{}' 2>/dev/null || echo '{"error":"curl_failed"}')
check "has count" "$R" '"count"'
check "has dataflows array" "$R" '"dataflows"'
check "PPL dataflow present" "$R" '"PPL"'

echo ""
echo "2. adbkidb.economies (static)"
R=$(curl -sf "$BASE/adbkidb.economies/call" -H "$AUTH" -H "$CT" -d '{}' 2>/dev/null || echo '{"error":"curl_failed"}')
check "has count=50" "$R" '"count":50'
check "has economies array" "$R" '"economies"'
check "India (IND) present" "$R" '"IND"'

echo ""
echo "3. adbkidb.indicators (upstream HTTP)"
R=$(curl -sf "$BASE/adbkidb.indicators/call" -H "$AUTH" -H "$CT" -d '{"dataflow":"PPL"}' 2>/dev/null || echo '{"error":"curl_failed"}')
check "has count" "$R" '"count"'
check "has indicators array" "$R" '"indicators"'
check "PPL_POP present" "$R" '"PPL_POP"'

echo ""
echo "4. adbkidb.data (SDMX upstream)"
R=$(curl -sf "$BASE/adbkidb.data/call" -H "$AUTH" -H "$CT" \
  -d '{"dataflow":"PPL","indicator_codes":["PPL_POP"],"economy_codes":["IND"],"start_year":2020,"end_year":2022}' \
  2>/dev/null || echo '{"error":"curl_failed"}')
check "has observations" "$R" '"observations"'
check "has observation_count" "$R" '"observation_count"'
check "PPL_POP indicator" "$R" '"PPL_POP"'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
