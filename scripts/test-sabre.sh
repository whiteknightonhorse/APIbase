#!/bin/bash
# APIbase.pro — Sabre GDS Smoke Tests (UC-023)
#
# Verifies Sabre adapter integration: catalog presence, tool details, live API calls.
#
# Usage:
#   API_URL=https://apibase.pro ./scripts/test-sabre.sh
#   API_URL=http://localhost:3000 ./scripts/test-sabre.sh
#
# Environment:
#   API_URL       — Base URL (default: https://apibase.pro)
#   TEST_API_KEY  — Valid API key for authenticated tests (optional, live tests skipped if absent)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
TEST_API_KEY="${TEST_API_KEY:-}"
PASSED=0
FAILED=0
SKIPPED=0

pass() { echo "  PASS"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL: $1"; FAILED=$((FAILED + 1)); }
skip() { echo "  SKIP: $1"; SKIPPED=$((SKIPPED + 1)); }

echo "=== Sabre GDS Smoke Tests (UC-023) ==="
echo "Target: $API_URL"
echo ""

# ---------------------------------------------------------------------------
# 1. Health check
# ---------------------------------------------------------------------------
echo -n "1/8 Health readiness..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/ready" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 2. Sabre tools in catalog (expect 4)
# ---------------------------------------------------------------------------
echo -n "2/8 Sabre tools in catalog..."
CATALOG=$(curl -s -H "Accept: application/json" "$API_URL/api/v1/tools" 2>/dev/null || echo "{}")
SABRE_COUNT=$(echo "$CATALOG" | grep -o '"sabre\.' | wc -l)
if [ "$SABRE_COUNT" -ge 4 ]; then
  pass
else
  fail "expected >= 4 sabre tools, found $SABRE_COUNT"
fi

# ---------------------------------------------------------------------------
# 3. Tool detail: sabre.search_flights
# ---------------------------------------------------------------------------
echo -n "3/8 Tool detail sabre.search_flights..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/sabre.search_flights" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 4. Tool detail: sabre.airline_lookup
# ---------------------------------------------------------------------------
echo -n "4/8 Tool detail sabre.airline_lookup..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/sabre.airline_lookup" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 5. Live: sabre.airline_lookup AA
# ---------------------------------------------------------------------------
echo -n "5/8 Live: sabre.airline_lookup (AA)..."
if [ -z "$TEST_API_KEY" ]; then
  skip "TEST_API_KEY not set"
else
  RESULT=$(curl -s -X POST "$API_URL/api/v1/tools/sabre.airline_lookup/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"airline_code":"AA"}' 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "american\|AirlineInfo"; then
    pass
  else
    fail "expected airline data, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 6. Live: sabre.search_flights JFK->LHR
# ---------------------------------------------------------------------------
echo -n "6/8 Live: sabre.search_flights (JFK->LHR)..."
if [ -z "$TEST_API_KEY" ]; then
  skip "TEST_API_KEY not set"
else
  DEPART=$(date -d "+30 days" +%Y-%m-%d 2>/dev/null || date -v+30d +%Y-%m-%d 2>/dev/null || echo "2026-04-15")
  RESULT=$(curl -s -X POST "$API_URL/api/v1/tools/sabre.search_flights/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"origin\":\"JFK\",\"destination\":\"LHR\",\"departure_date\":\"$DEPART\",\"limit\":5}" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "PricedItinerar\|TotalFare\|Amount"; then
    pass
  else
    fail "expected flight data, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 7. Live: sabre.travel_themes
# ---------------------------------------------------------------------------
echo -n "7/8 Live: sabre.travel_themes..."
if [ -z "$TEST_API_KEY" ]; then
  skip "TEST_API_KEY not set"
else
  RESULT=$(curl -s -X POST "$API_URL/api/v1/tools/sabre.travel_themes/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "BEACH\|Theme"; then
    pass
  else
    fail "expected theme data, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 8. Live: sabre.destination_finder JFK
# ---------------------------------------------------------------------------
echo -n "8/8 Live: sabre.destination_finder (JFK)..."
if [ -z "$TEST_API_KEY" ]; then
  skip "TEST_API_KEY not set"
else
  DEPART=$(date -d "+30 days" +%Y-%m-%d 2>/dev/null || date -v+30d +%Y-%m-%d 2>/dev/null || echo "2026-04-15")
  RETURN=$(date -d "+37 days" +%Y-%m-%d 2>/dev/null || date -v+37d +%Y-%m-%d 2>/dev/null || echo "2026-04-22")
  RESULT=$(curl -s -X POST "$API_URL/api/v1/tools/sabre.destination_finder/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"origin\":\"JFK\",\"departure_date\":\"$DEPART\",\"return_date\":\"$RETURN\"}" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "FareInfo\|LowestFare\|Destination"; then
    pass
  else
    fail "expected fare data, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Results: $PASSED passed, $FAILED failed, $SKIPPED skipped ==="
if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
echo "Sabre GDS integration OK"
