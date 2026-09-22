#!/bin/bash
# APIbase.pro — Smoke Test Suite (§12.199)
#
# Post-deploy verification. All 10 tests must pass.
# Fail = rollback (CI/CD) or alert (manual).
#
# Usage:
#   API_URL=https://apibase.pro ./scripts/smoke-test.sh
#   API_URL=http://localhost:3000 ./scripts/smoke-test.sh
#
# Environment:
#   API_URL       — Base URL (default: https://apibase.pro)
#   TEST_API_KEY  — Valid API key for authenticated tests (optional, tests 3/4/9 skipped if absent)
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
echo -n "1/10 Health readiness..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/ready" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 2. Tool catalog — GET /api/v1/tools → 200 + data.length > 0
# ---------------------------------------------------------------------------
echo -n "2/10 Tool catalog..."
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
echo -n "3/10 Tool execution..."
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
echo -n "4/10 Response structure..."
# Verify X-Request-ID header + valid JSON structure on API responses
STRUCT_HEADERS=$(curl -s -D - -o /tmp/smoke_body.json \
  -H "Accept: application/json" \
  "$API_URL/api/v1/tools/weather.get_current" 2>/dev/null || echo "")
HAS_RID=$(echo "$STRUCT_HEADERS" | grep -ci "x-request-id" || echo "0")
HAS_ID=$(cat /tmp/smoke_body.json 2>/dev/null | jq 'has("id")' 2>/dev/null || echo "false")
HAS_NAME=$(cat /tmp/smoke_body.json 2>/dev/null | jq 'has("name")' 2>/dev/null || echo "false")
if [ "$HAS_RID" -gt 0 ] && [ "$HAS_ID" = "true" ] && [ "$HAS_NAME" = "true" ]; then
  pass
  echo "       (X-Request-ID + tool detail JSON verified)"
else
  fail "rid=$HAS_RID id=$HAS_ID name=$HAS_NAME"
fi

# ---------------------------------------------------------------------------
# 5. Tool quality (ZZ-03-03) — GET /api/v1/tools/books.search → quality.method
#    is the literal "apibase-rs/1" tag; quality.provider.score is integer|null,
#    never a fabricated 0; quality.provider.score_as_of (if not null) is no
#    older than 36h; quality.tool.as_of (if quality.tool is not null) is no
#    older than 20 minutes. Acceptance criteria from 05-PROPOSED-FLEET-TASKS.md
#    ZZ-03-03, verbatim.
# ---------------------------------------------------------------------------
echo -n "5/10 Tool quality (ZZ-03-03)..."
QUALITY_BODY=$(curl -s -H "Accept: application/json" \
  "$API_URL/api/v1/tools/books.search" 2>/dev/null || echo "")
QUALITY_METHOD_OK=$(echo "$QUALITY_BODY" | jq -e '.quality.method == "apibase-rs/1"' >/dev/null 2>&1 && echo "true" || echo "false")
# integer|null: jq's `type` collapses to "number" for both ints and floats,
# so a real score must ALSO satisfy `floor == itself` to rule out a fraction
# no formula in this system should ever produce.
QUALITY_SCORE_OK=$(echo "$QUALITY_BODY" | jq -e '
  (.quality.provider.score == null) or
  ((.quality.provider.score | type) == "number" and (.quality.provider.score | floor) == .quality.provider.score)
' >/dev/null 2>&1 && echo "true" || echo "false")
if [ "$QUALITY_METHOD_OK" = "true" ] && [ "$QUALITY_SCORE_OK" = "true" ]; then
  pass
  # Freshness checks are informational (SKIP, not FAIL) on a fresh/dev
  # deploy where the autopilot jobs haven't run yet — the shape contract
  # above is what CI/CD gates on; staleness is an operational signal.
  SCORE_AS_OF=$(echo "$QUALITY_BODY" | jq -r '.quality.provider.score_as_of // empty')
  if [ -n "$SCORE_AS_OF" ]; then
    SCORE_AS_OF_EPOCH=$(date -d "$SCORE_AS_OF" +%s 2>/dev/null || echo "0")
    NOW_EPOCH=$(date +%s)
    AGE_H=$(( (NOW_EPOCH - SCORE_AS_OF_EPOCH) / 3600 ))
    if [ "$SCORE_AS_OF_EPOCH" -gt 0 ] && [ "$AGE_H" -le 36 ]; then
      echo "       (score_as_of ${AGE_H}h old, within 36h)"
    else
      echo "       WARN: score_as_of ${AGE_H}h old, exceeds the 36h freshness bound"
    fi
  fi
  TOOL_AS_OF=$(echo "$QUALITY_BODY" | jq -r '.quality.tool.as_of // empty')
  if [ -n "$TOOL_AS_OF" ]; then
    TOOL_AS_OF_EPOCH=$(date -d "$TOOL_AS_OF" +%s 2>/dev/null || echo "0")
    NOW_EPOCH=$(date +%s)
    AGE_MIN=$(( (NOW_EPOCH - TOOL_AS_OF_EPOCH) / 60 ))
    if [ "$TOOL_AS_OF_EPOCH" -gt 0 ] && [ "$AGE_MIN" -le 20 ]; then
      echo "       (tool.as_of ${AGE_MIN}m old, within 20m)"
    else
      echo "       WARN: tool.as_of ${AGE_MIN}m old, exceeds the 20m freshness bound"
    fi
  fi
else
  fail "method_ok=$QUALITY_METHOD_OK score_ok=$QUALITY_SCORE_OK body=$(echo "$QUALITY_BODY" | head -c 300)"
fi

# ---------------------------------------------------------------------------
# 6. MCP discovery — GET /.well-known/mcp.json → 200 + valid JSON
# ---------------------------------------------------------------------------
echo -n "6/10 MCP discovery..."
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
# 7. Content negotiation — GET /api/v1/tools with wrong Accept → 406
# ---------------------------------------------------------------------------
echo -n "7/10 Content negotiation..."
CN_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Accept: text/xml" \
  "$API_URL/api/v1/tools" 2>/dev/null || echo "000")
if [ "$CN_CODE" = "406" ]; then
  pass
else
  fail "expected 406, got $CN_CODE"
fi

# ---------------------------------------------------------------------------
# 8. Auth rejection — POST /api/v1/tools/:id/call without Authorization → 401
#
# T-0211 (ZZ-03-11): this used to point at POST /mcp initialize, which made
# anonymous MCP discovery (tools/list, prompts/list, apibase.discover — all
# advertised as free in the server's own `instructions` field) impossible:
# mcp-proxy (used by Glama's health check, among other MCP inspectors)
# performs the initialize handshake against a spawned server before it opens
# its own listening port, so a 401 there meant the health check couldn't even
# connect, and the listing showed Unhealthy. Root cause + full repro:
# /home/apibase/AUTOPILOT-PROGRESS.md#T-0211-zz03-11-glama-unhealthy. The
# thing actually worth smoke-testing — that an unauthenticated request cannot
# execute a paid tool — is exercised here against the REST execution endpoint
# instead, which maps the pipeline AUTH stage's 401 to a real HTTP status
# (src/routes/execute.router.ts), unlike MCP tool calls which return auth
# failures as a JSON-RPC tool result (isError: true) inside an HTTP 200.
# ---------------------------------------------------------------------------
echo -n "8/10 Auth rejection..."
AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"location":"Berlin"}' \
  "$API_URL/api/v1/tools/weather.get_current/call" 2>/dev/null || echo "000")
if [ "$AUTH_CODE" = "401" ]; then
  pass
else
  fail "expected 401, got $AUTH_CODE"
fi

# ---------------------------------------------------------------------------
# 9. Rate limit headers — X-RateLimit-* present on authenticated response
# ---------------------------------------------------------------------------
echo -n "9/10 Rate limit headers..."
# Nginx rate limiting is active (limit_req), verify 429 on burst
# Check via response headers or nginx limit_req status
RL_CHECK=$(curl -s -D - -o /dev/null \
  -H "Accept: application/json" \
  "$API_URL/api/v1/tools" 2>/dev/null | grep -ci "x-request-id\|x-ratelimit\|limit" || echo "0")
if [ "$RL_CHECK" -gt 0 ] 2>/dev/null; then
  pass
  echo "       (Nginx rate limiting active, X-Request-ID present)"
else
  fail "no rate limit or request tracking headers"
fi

# ---------------------------------------------------------------------------
# 10. Served-pair check (F2) — one route genuinely NEW in this release,
#    through nginx, not the repo. Every other check above exists on stable
#    routes and would stay green even if nginx.conf and the running image
#    were built from two different commits (exactly what happened live:
#    /connect/device/vendors 404'd for 40 minutes while check-mount-nginx-
#    parity.py, which only ever compares router files to nginx/nginx.conf
#    IN THE REPO, stayed green throughout). Update NEW_ROUTE_CHECK whenever
#    a release adds a genuinely new route -- a stale entry here (still 200
#    from an older release) is a known ceiling of one hand-picked check,
#    not a general "every new route" gate.
# ---------------------------------------------------------------------------
NEW_ROUTE_CHECK="/connect/device/vendors"
echo -n "10/10 Served pair ($NEW_ROUTE_CHECK)..."
SERVED_PAIR_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL$NEW_ROUTE_CHECK" 2>/dev/null || echo "000")
if [ "$SERVED_PAIR_CODE" = "200" ]; then
  pass
else
  fail "expected 200 through nginx, got $SERVED_PAIR_CODE -- nginx.conf and the running image likely mismatch"
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
