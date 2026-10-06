#!/bin/bash
# APIbase sandbox smoke (T-INT-26, spec F-17). Run by the dispatcher AFTER the sandbox is deployed.
#
#   SANDBOX_URL=https://sandbox.apibase.pro ./scripts/sandbox/smoke.sh
#   SANDBOX_URL=http://127.0.0.1:8881 ./scripts/sandbox/smoke.sh      # before DNS exists
#
# Read-only apart from one test-SKU quote that is cancelled at once (a quote holds no money).
# Needs a seeded demo merchant (default slug apibase-demo, test SKU __apibase_test) in the
# sandbox DB. Exit 0 = all checks passed, 1 = at least one failed.
set -uo pipefail

SANDBOX_URL="${SANDBOX_URL:-https://sandbox.apibase.pro}"
MERCHANT="${SANDBOX_MERCHANT:-apibase-demo}"
TEST_SKU="${SANDBOX_TEST_SKU:-__apibase_test}"
EXPECT_NETWORK="eip155:84532" # base-sepolia, CAIP-2 form emitted by src/config/x402.config.ts
PASSED=0
FAILED=0

pass() { echo "  PASS"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL: $1"; FAILED=$((FAILED + 1)); }

# curl wrapper: body to $BODY, status to $CODE
BODY=""
CODE=""
call() {
  local out
  out=$(curl -sS --max-time 20 -w $'\n%{http_code}' "$@" 2>&1) || { CODE=000; BODY="$out"; return; }
  CODE="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
}
MCP_HDRS=(-H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream')

echo "Sandbox smoke against $SANDBOX_URL"

echo "1. /health/ready"
call "$SANDBOX_URL/health/ready"
if [ "$CODE" = 200 ]; then pass; else fail "HTTP $CODE"; fi

echo "2. MCP initialize on /mcp"
call -X POST "$SANDBOX_URL/mcp" "${MCP_HDRS[@]}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"sandbox-smoke","version":"1"}}}'
if [ "$CODE" = 200 ] && printf '%s' "$BODY" | grep -q '"protocolVersion"'; then pass; else fail "HTTP $CODE"; fi

echo "3. discover is listed on /mcp (tools/list)"
call -X POST "$SANDBOX_URL/mcp" "${MCP_HDRS[@]}" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
if [ "$CODE" = 200 ] && printf '%s' "$BODY" | grep -q 'apibase.discover'; then pass; else fail "HTTP $CODE, no apibase.discover"; fi

echo "4. test-SKU quote on testnet"
QUOTE_ID=""
ORDER_ID=""
call -X POST "$SANDBOX_URL/api/v1/shop/quotes" -H 'Content-Type: application/json' \
  -H "x-idempotency-key: sandbox-smoke-$(date -u +%s)-$$" \
  -d "{\"merchant\":\"$MERCHANT\",\"items\":[{\"sku\":\"$TEST_SKU\",\"qty\":1}]}"
if [ "$CODE" = 201 ]; then
  QUOTE_ID=$(printf '%s' "$BODY" | sed -n 's/.*"quote_id":"\([^"]*\)".*/\1/p')
  ORDER_ID=$(printf '%s' "$BODY" | sed -n 's/.*"order_id":"\([^"]*\)".*/\1/p')
  if [ -n "$QUOTE_ID" ]; then pass; else fail "201 without quote_id"; fi
else
  fail "HTTP $CODE ${BODY:0:200}"
fi

echo "5. 402 challenge names base-sepolia"
if [ -z "$QUOTE_ID" ]; then
  fail "no quote from step 4"
else
  call "$SANDBOX_URL/api/v1/shop/quotes/$QUOTE_ID/pay"
  if [ "$CODE" = 402 ] && printf '%s' "$BODY" | grep -q "\"network\":\"$EXPECT_NETWORK\""; then
    pass
  else
    fail "HTTP $CODE, expected a 402 with network $EXPECT_NETWORK"
  fi
fi

# A smoke quote holds no money; cancel it so it does not hold test stock.
if [ -n "$ORDER_ID" ]; then
  curl -sS --max-time 20 -o /dev/null -X POST "$SANDBOX_URL/api/v1/shop/orders/$ORDER_ID/cancel" || true
fi

echo "Passed: $PASSED  Failed: $FAILED"
[ "$FAILED" -eq 0 ]
