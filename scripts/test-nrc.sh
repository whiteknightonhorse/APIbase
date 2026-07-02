#!/usr/bin/env bash
# Smoke test for NRC Power Reactor Status (UC-563)
# Usage: TEST_API_KEY=ak_live_... bash scripts/test-nrc.sh

set -euo pipefail
BASE="https://apibase.pro"
TEST_API_KEY="${TEST_API_KEY:-}"
PASS=0; FAIL=0

ok()   { echo "[PASS] $1"; PASS=$((PASS+1)); }
fail() { echo "[FAIL] $1"; FAIL=$((FAIL+1)); }

echo "=== NRC Power Reactor Status Smoke Test (UC-563) ==="
echo ""

# 1. Health check
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
[ "$STATUS" = "ready" ] && ok "Health check" || fail "Health check (got: $STATUS)"

# 2. Tools in catalog (all 4 must appear)
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
nrc_tools = [t for t in d['data'] if t.get('provider') == 'nrc']
print(len(nrc_tools))
" 2>/dev/null)
[ "$COUNT" = "4" ] && ok "4 NRC tools in catalog" || fail "Expected 4 NRC tools, got: $COUNT"

# 3. Tool detail endpoints
for TOOL in nrc.current_status nrc.reactor_history nrc.outages nrc.annual_data; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  [ "$HTTP" = "200" ] && ok "Tool detail: $TOOL (200)" || fail "Tool detail: $TOOL (got $HTTP)"
done

# 4. Schema populated (nrc.reactor_history must have 'unit' param)
PROPS=$(curl -s "$BASE/api/v1/tools/nrc.reactor_history" | python3 -c "
import sys,json; t=json.load(sys.stdin); print(list(t.get('input_schema',{}).get('properties',{}).keys()))
" 2>/dev/null)
echo "$PROPS" | grep -q "unit" && ok "reactor_history schema has 'unit' param" || fail "reactor_history schema missing 'unit': $PROPS"

# 5. Live API calls (requires TEST_API_KEY)
if [ -n "$TEST_API_KEY" ]; then
  RES=$(curl -s -X POST "$BASE/api/v1/tools/nrc.current_status/call" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -d '{}' 2>/dev/null)
  TOTAL=$(echo "$RES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('total_reactors','ERROR'))" 2>/dev/null)
  [ "$TOTAL" -gt "80" ] 2>/dev/null && ok "nrc.current_status: $TOTAL reactors returned" || fail "nrc.current_status (got: $TOTAL, response: ${RES:0:200})"

  RES2=$(curl -s -X POST "$BASE/api/v1/tools/nrc.outages/call" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -d '{"max_power": 99}' 2>/dev/null)
  OUTAGE_DATE=$(echo "$RES2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('report_date','ERROR'))" 2>/dev/null)
  [ "$OUTAGE_DATE" != "ERROR" ] && ok "nrc.outages: report_date=$OUTAGE_DATE" || fail "nrc.outages failed: ${RES2:0:200}"

  RES3=$(curl -s -X POST "$BASE/api/v1/tools/nrc.reactor_history/call" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -d '{"unit": "Diablo Canyon 1", "days": 7}' 2>/dev/null)
  HIST_COUNT=$(echo "$RES3" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('days_returned','ERROR'))" 2>/dev/null)
  [ "$HIST_COUNT" -gt "0" ] 2>/dev/null && ok "nrc.reactor_history: $HIST_COUNT days returned for Diablo Canyon 1" || fail "nrc.reactor_history failed: ${RES3:0:200}"
else
  echo "[SKIP] Live API call tests (set TEST_API_KEY to enable)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
