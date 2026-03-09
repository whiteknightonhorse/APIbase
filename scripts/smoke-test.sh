#!/bin/bash
# APIbase.pro — Smoke Test Suite (§12.199)
#
# Post-deploy verification. All 8 tests must pass.
# Fail = rollback (CI/CD) or alert (manual).
#
# Usage:
#   API_URL=https://apibase.pro ./scripts/smoke-test.sh
#   API_URL=http://localhost:3000 ./scripts/smoke-test.sh
#
# Environment:
#   API_URL       — Base URL (default: https://apibase.pro)
#   TEST_API_KEY  — Valid API key for authenticated tests (optional, tests 3/4/8 skipped if absent)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
TEST_API_KEY="${TEST_API_KEY:-}"
PASSED=0
FAILED=0
SKIPPED=0

pass() { echo "  PASS"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL: $1"; FAILED=$((FAILED + 1)); }
skip() { echo "  SKIP: $1"; SKIPPED=$((SKIPPED + 1)); }

echo "=== APIbase Smoke Test Suite (§12.199) ==="
echo "Target: $API_URL"
echo ""

# ---------------------------------------------------------------------------
# 1. Health readiness — GET /health/ready → 200
# ---------------------------------------------------------------------------
echo -n "1/8 Health readiness..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/ready" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 2. Tool catalog — GET /api/v1/tools → 200 + data.length > 0
# ---------------------------------------------------------------------------
echo -n "2/8 Tool catalog..."
CATALOG_RAW=$(curl -s -w "\n%{http_code}" -H "Accept: application/json" "$API_URL/api/v1/tools" 2>/dev/null || echo -e "\n000")
CATALOG_HTTP=$(echo "$CATALOG_RAW" | tail -1)
CATALOG_BODY=$(echo "$CATALOG_RAW" | sed '$d')
if [ "$CATALOG_HTTP" != "200" ]; then
  fail "expected 200, got $CATALOG_HTTP"
else
  TOOL_COUNT=$(echo "$CATALOG_BODY" | jq -r '.data | length' 2>/dev/null || echo "0")
  if [ "$TOOL_COUNT" -gt 0 ] 2>/dev/null; then
    pass
    echo "       ($TOOL_COUNT tools)"
  else
    fail "expected tools > 0, got $TOOL_COUNT"
  fi
fi

# ---------------------------------------------------------------------------
# 3. Tool execution — GET /api/v1/tools/weather.get_current?city=Berlin → 200 + data
#    Requires TEST_API_KEY for authenticated tool call via HTTP.
#    Falls back to tool detail endpoint if no key provided.
# ---------------------------------------------------------------------------
echo -n "3/8 Tool execution..."
if [ -n "$TEST_API_KEY" ]; then
  TOOL_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Accept: application/json" \
    "$API_URL/api/v1/tools/weather.get_current?city=Berlin" 2>/dev/null || echo -e "\n000")
  TOOL_HTTP=$(echo "$TOOL_RESPONSE" | tail -1)
  TOOL_BODY=$(echo "$TOOL_RESPONSE" | sed '$d')
  if [ "$TOOL_HTTP" = "200" ]; then
    HAS_DATA=$(echo "$TOOL_BODY" | jq 'has("data") or has("tool_id") or has("id")' 2>/dev/null || echo "false")
    if [ "$HAS_DATA" = "true" ]; then
      pass
    else
      fail "200 but missing expected fields"
    fi
  else
    fail "expected 200, got $TOOL_HTTP"
  fi
else
  # Fallback: verify tool detail endpoint returns 200
  DETAIL_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Accept: application/json" \
    "$API_URL/api/v1/tools/weather.get_current" 2>/dev/null || echo "000")
  if [ "$DETAIL_CODE" = "200" ]; then
    pass
    echo "       (tool detail — set TEST_API_KEY for full execution test)"
  else
    fail "tool detail expected 200, got $DETAIL_CODE"
  fi
fi

# ---------------------------------------------------------------------------
# 4. Response structure — Parse response → data + request_id present
# ---------------------------------------------------------------------------
echo -n "4/8 Response structure..."
if [ -n "$TEST_API_KEY" ] && [ -n "${TOOL_BODY:-}" ]; then
  HAS_DATA=$(echo "$TOOL_BODY" | jq 'has("data")' 2>/dev/null || echo "false")
  HAS_RID=$(echo "$TOOL_BODY" | jq 'has("request_id")' 2>/dev/null || echo "false")
  if [ "$HAS_DATA" = "true" ] && [ "$HAS_RID" = "true" ]; then
    pass
  else
    fail "data=$HAS_DATA request_id=$HAS_RID"
  fi
else
  # Verify X-Request-ID header is present on API responses
  RID_HEADER=$(curl -s -D - -o /dev/null \
    -H "Accept: application/json" \
    "$API_URL/api/v1/tools" 2>/dev/null | grep -i "x-request-id" || echo "")
  if [ -n "$RID_HEADER" ]; then
    pass
    echo "       (X-Request-ID header present)"
  else
    # Tool detail response structure check
    DETAIL_BODY=$(curl -s -H "Accept: application/json" \
      "$API_URL/api/v1/tools/weather.get_current" 2>/dev/null || echo "{}")
    HAS_ID=$(echo "$DETAIL_BODY" | jq 'has("tool_id") or has("id")' 2>/dev/null || echo "false")
    HAS_NAME=$(echo "$DETAIL_BODY" | jq 'has("name")' 2>/dev/null || echo "false")
    if [ "$HAS_ID" = "true" ] && [ "$HAS_NAME" = "true" ]; then
      pass
      echo "       (tool detail structure verified)"
    else
      fail "unexpected response structure"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 5. MCP discovery — GET /.well-known/mcp.json → 200 + valid JSON
# ---------------------------------------------------------------------------
echo -n "5/8 MCP discovery..."
MCP_RAW=$(curl -s -w "\n%{http_code}" "$API_URL/.well-known/mcp.json" 2>/dev/null || echo -e "\n000")
MCP_HTTP=$(echo "$MCP_RAW" | tail -1)
MCP_BODY=$(echo "$MCP_RAW" | sed '$d')
if [ "$MCP_HTTP" != "200" ]; then
  fail "expected 200, got $MCP_HTTP"
else
  MCP_VALID=$(echo "$MCP_BODY" | jq -e '.name' >/dev/null 2>&1 && echo "true" || echo "false")
  if [ "$MCP_VALID" = "true" ]; then
    pass
  else
    fail "invalid JSON or missing 'name' field"
  fi
fi

# ---------------------------------------------------------------------------
# 6. Content negotiation — GET /api/v1/tools with wrong Accept → 406
# ---------------------------------------------------------------------------
echo -n "6/8 Content negotiation..."
CN_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Accept: text/xml" \
  "$API_URL/api/v1/tools" 2>/dev/null || echo "000")
if [ "$CN_CODE" = "406" ]; then
  pass
else
  fail "expected 406, got $CN_CODE"
fi

# ---------------------------------------------------------------------------
# 7. Auth rejection — GET /mcp without Authorization → 401
# ---------------------------------------------------------------------------
echo -n "7/8 Auth rejection..."
AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API_URL/mcp" 2>/dev/null || echo "000")
if [ "$AUTH_CODE" = "401" ]; then
  pass
else
  fail "expected 401, got $AUTH_CODE"
fi

# ---------------------------------------------------------------------------
# 8. Rate limit headers — X-RateLimit-* present on authenticated response
# ---------------------------------------------------------------------------
echo -n "8/8 Rate limit headers..."
if [ -n "$TEST_API_KEY" ]; then
  RL_HEADERS=$(curl -s -D - -o /dev/null \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Accept: application/json" \
    "$API_URL/api/v1/tools" 2>/dev/null | grep -ci "x-ratelimit" || echo "0")
  if [ "$RL_HEADERS" -gt 0 ] 2>/dev/null; then
    pass
  else
    fail "X-RateLimit-* headers not found"
  fi
else
  skip "TEST_API_KEY not set"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Results ==="
TOTAL=$((PASSED + FAILED + SKIPPED))
echo "Passed: $PASSED/$TOTAL"
[ "$SKIPPED" -gt 0 ] && echo "Skipped: $SKIPPED/$TOTAL"
[ "$FAILED" -gt 0 ] && echo "Failed: $FAILED/$TOTAL"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo "=== SMOKE TESTS FAILED ==="
  exit 1
fi

echo "=== All smoke tests passed ==="
exit 0
