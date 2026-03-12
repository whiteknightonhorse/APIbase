#!/bin/bash
# APIbase.pro — Amadeus Travel APIs Smoke Tests (UC-022)
#
# Verifies Amadeus adapter integration: catalog presence, tool details, live API calls.
#
# Usage:
#   API_URL=https://apibase.pro ./scripts/test-amadeus.sh
#   API_URL=http://localhost:3000 ./scripts/test-amadeus.sh
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

echo "=== Amadeus Travel APIs Smoke Tests (UC-022) ==="
echo "Target: $API_URL"
echo ""

# ---------------------------------------------------------------------------
# 1. Health check
# ---------------------------------------------------------------------------
echo -n "1/10 Health readiness..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/ready" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 2. Amadeus tools in catalog (expect 7)
# ---------------------------------------------------------------------------
echo -n "2/10 Amadeus tools in catalog..."
CATALOG=$(curl -s -H "Accept: application/json" "$API_URL/api/v1/tools?limit=100" 2>/dev/null || echo "{}")
AMADEUS_COUNT=$(echo "$CATALOG" | grep -o '"amadeus\.' | wc -l)
if [ "$AMADEUS_COUNT" -ge 7 ]; then
  pass
else
  fail "expected >= 7 amadeus tools, found $AMADEUS_COUNT"
fi

# ---------------------------------------------------------------------------
# 3. Tool detail: amadeus.flight_search
# ---------------------------------------------------------------------------
echo -n "3/10 Tool detail amadeus.flight_search..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/amadeus.flight_search" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 4. Tool detail: amadeus.airline_lookup
# ---------------------------------------------------------------------------
echo -n "4/10 Tool detail amadeus.airline_lookup..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/amadeus.airline_lookup" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 5. Live: amadeus.airline_lookup BA
# ---------------------------------------------------------------------------
echo -n "5/10 Live: amadeus.airline_lookup (BA)..."
if [ -z "$TEST_API_KEY" ]; then
  skip "TEST_API_KEY not set"
else
  RESULT=$(curl -s -X POST "$API_URL/api/v1/tools/amadeus.airline_lookup/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"airline_code":"BA"}' 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "british\|BRITISH\|businessName\|iataCode"; then
    pass
  else
    fail "expected airline data, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 6. Live: amadeus.airport_search JFK
# ---------------------------------------------------------------------------
echo -n "6/10 Live: amadeus.airport_search (JFK)..."
if [ -z "$TEST_API_KEY" ]; then
  skip "TEST_API_KEY not set"
else
  RESULT=$(curl -s -X POST "$API_URL/api/v1/tools/amadeus.airport_search/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"keyword":"JFK"}' 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "KENNEDY\|JFK\|iataCode\|AIRPORT"; then
    pass
  else
    fail "expected airport data, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 7. Live: amadeus.airport_nearest (NYC area)
# ---------------------------------------------------------------------------
echo -n "7/10 Live: amadeus.airport_nearest (40.6,-73.7)..."
if [ -z "$TEST_API_KEY" ]; then
  skip "TEST_API_KEY not set"
else
  RESULT=$(curl -s -X POST "$API_URL/api/v1/tools/amadeus.airport_nearest/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"latitude":40.6,"longitude":-73.7}' 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "JFK\|LGA\|EWR\|iataCode"; then
    pass
  else
    fail "expected nearby airports, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 8. Live: amadeus.flight_search JFK->LHR
# ---------------------------------------------------------------------------
echo -n "8/10 Live: amadeus.flight_search (JFK->LHR)..."
if [ -z "$TEST_API_KEY" ]; then
  skip "TEST_API_KEY not set"
else
  DEPART=$(date -d "+30 days" +%Y-%m-%d 2>/dev/null || date -v+30d +%Y-%m-%d 2>/dev/null || echo "2026-04-15")
  RESULT=$(curl -s -X POST "$API_URL/api/v1/tools/amadeus.flight_search/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"origin\":\"JFK\",\"destination\":\"LHR\",\"departure_date\":\"$DEPART\",\"max_results\":3}" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "flightOffer\|itineraries\|grandTotal\|data"; then
    pass
  else
    fail "expected flight data, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 9. Live: amadeus.flight_status
# ---------------------------------------------------------------------------
echo -n "9/10 Live: amadeus.flight_status (BA115)..."
if [ -z "$TEST_API_KEY" ]; then
  skip "TEST_API_KEY not set"
else
  TODAY=$(date +%Y-%m-%d 2>/dev/null || echo "2026-03-12")
  RESULT=$(curl -s -X POST "$API_URL/api/v1/tools/amadeus.flight_status/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"carrier_code\":\"BA\",\"flight_number\":\"115\",\"date\":\"$TODAY\"}" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "flightDesignator\|scheduledDeparture\|data\|flightPoints"; then
    pass
  else
    fail "expected flight status, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 10. Live: amadeus.airport_routes JFK
# ---------------------------------------------------------------------------
echo -n "10/10 Live: amadeus.airport_routes (JFK)..."
if [ -z "$TEST_API_KEY" ]; then
  skip "TEST_API_KEY not set"
else
  RESULT=$(curl -s -X POST "$API_URL/api/v1/tools/amadeus.airport_routes/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"airport_code":"JFK"}' 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "iataCode\|data\|destination"; then
    pass
  else
    fail "expected route data, got: $(echo "$RESULT" | head -c 200)"
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
echo "Amadeus Travel APIs integration OK"
