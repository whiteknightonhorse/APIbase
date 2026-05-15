#!/usr/bin/env bash
# Smoke test for Razorpay IFSC (UC-425)
# Tests: health, catalog presence, tool detail, live API call

set -euo pipefail

BASE_URL="${BASE_URL:-https://apibase.pro}"
TEST_API_KEY="${TEST_API_KEY:-}"

pass() { echo "  PASS: $*"; }
fail() { echo "  FAIL: $*"; exit 1; }

echo "=== Razorpay IFSC Smoke Test (UC-425) ==="

# 1. Health check
echo "1/4 Health..."
STATUS=$(curl -s "${BASE_URL}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && pass "API healthy" || fail "Health check failed: $STATUS"

# 2. Tool appears in catalog
echo "2/4 Catalog..."
COUNT=$(curl -s "${BASE_URL}/api/v1/tools?search=razorpayifsc" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
[ "$COUNT" -ge 1 ] && pass "Found $COUNT razorpayifsc tool(s)" || fail "No razorpayifsc tools in catalog"

# 3. Tool detail endpoint
echo "3/4 Tool detail..."
DETAIL=$(curl -s "${BASE_URL}/api/v1/tools/razorpayifsc.lookup")
HAS_SCHEMA=$(echo "$DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('input_schema',{}).get('properties') else 'no')")
[ "$HAS_SCHEMA" = "yes" ] && pass "Tool has input_schema" || fail "Tool missing input_schema"

# 4. Live API call (requires TEST_API_KEY)
echo "4/4 Live call..."
if [ -z "$TEST_API_KEY" ]; then
  echo "  SKIP: set TEST_API_KEY for live call test"
else
  RESULT=$(curl -s -X POST "${BASE_URL}/api/v1/tools/razorpayifsc.lookup/call" \
    -H "Authorization: Bearer ${TEST_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"ifsc_code":"SBIN0005943"}')
  BANK=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('bank','ERROR'))" 2>/dev/null || echo "ERROR")
  [ "$BANK" = "STATE BANK OF INDIA" ] && pass "Live call: bank=$BANK" || fail "Live call failed: $RESULT"
fi

echo ""
echo "=== Razorpay IFSC smoke test DONE ==="
