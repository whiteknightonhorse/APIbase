#!/bin/bash
# APIbase.pro — Amadeus Travel APIs Smoke Tests (UC-022)
#
# Verifies Amadeus adapter integration:
#   Tests 1-4: Catalog presence, tool details (REST)
#   Tests 5-10: Live Amadeus API calls (direct, validates credentials)
#
# Usage:
#   API_URL=https://apibase.pro ./scripts/test-amadeus.sh
#
# Environment:
#   API_URL  — Base URL (default: https://apibase.pro)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
# Amadeus credentials from .env (source if available)
AMADEUS_API_KEY="${AMADEUS_API_KEY:-}"
AMADEUS_API_SECRET="${AMADEUS_API_SECRET:-}"
AMADEUS_BASE="https://api.amadeus.com"
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
# Helper: get Amadeus OAuth2 token
# ---------------------------------------------------------------------------
get_amadeus_token() {
  if [ -z "$AMADEUS_API_KEY" ] || [ -z "$AMADEUS_API_SECRET" ]; then
    return 1
  fi
  curl -sf -X POST "$AMADEUS_BASE/v1/security/oauth2/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=$AMADEUS_API_KEY&client_secret=$AMADEUS_API_SECRET" 2>/dev/null \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])" 2>/dev/null
}

# ---------------------------------------------------------------------------
# 5. Live: OAuth2 token
# ---------------------------------------------------------------------------
echo -n "5/10 Live: Amadeus OAuth2 token..."
AMADEUS_TOKEN=$(get_amadeus_token 2>/dev/null || echo "")
if [ -z "$AMADEUS_API_KEY" ] || [ -z "$AMADEUS_API_SECRET" ]; then
  skip "AMADEUS_API_KEY/SECRET not set"
elif [ -n "$AMADEUS_TOKEN" ]; then
  pass
else
  fail "could not obtain OAuth2 token"
fi

# ---------------------------------------------------------------------------
# 6. Live: airline_lookup (BA)
# ---------------------------------------------------------------------------
echo -n "6/10 Live: airline_lookup (BA)..."
if [ -z "$AMADEUS_TOKEN" ]; then
  skip "no token"
else
  RESULT=$(curl -sf "$AMADEUS_BASE/v1/reference-data/airlines?airlineCodes=BA" \
    -H "Authorization: Bearer $AMADEUS_TOKEN" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "BRITISH"; then
    pass
  else
    fail "expected BRITISH AIRWAYS, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 7. Live: airport_search (JFK)
# ---------------------------------------------------------------------------
echo -n "7/10 Live: airport_search (JFK)..."
if [ -z "$AMADEUS_TOKEN" ]; then
  skip "no token"
else
  RESULT=$(curl -sf "$AMADEUS_BASE/v1/reference-data/locations?keyword=JFK&subType=AIRPORT&page%5Blimit%5D=5" \
    -H "Authorization: Bearer $AMADEUS_TOKEN" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "KENNEDY\|JFK"; then
    pass
  else
    fail "expected JFK data, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 8. Live: airport_nearest (NYC area)
# ---------------------------------------------------------------------------
echo -n "8/10 Live: airport_nearest (40.6,-73.7)..."
if [ -z "$AMADEUS_TOKEN" ]; then
  skip "no token"
else
  RESULT=$(curl -sf "$AMADEUS_BASE/v1/reference-data/locations/airports?latitude=40.6&longitude=-73.7" \
    -H "Authorization: Bearer $AMADEUS_TOKEN" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "JFK\|LGA\|EWR"; then
    pass
  else
    fail "expected nearby airports, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 9. Live: flight_search (JFK->LHR)
# ---------------------------------------------------------------------------
echo -n "9/10 Live: flight_search (JFK->LHR)..."
if [ -z "$AMADEUS_TOKEN" ]; then
  skip "no token"
else
  DEPART=$(date -d "+30 days" +%Y-%m-%d 2>/dev/null || date -v+30d +%Y-%m-%d 2>/dev/null || echo "2026-04-15")
  RESULT=$(curl -sf "$AMADEUS_BASE/v2/shopping/flight-offers?originLocationCode=JFK&destinationLocationCode=LHR&departureDate=$DEPART&adults=1&max=3" \
    -H "Authorization: Bearer $AMADEUS_TOKEN" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "itineraries\|grandTotal\|flightOffer"; then
    pass
  else
    fail "expected flight data, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 10. Live: airport_routes (JFK)
# ---------------------------------------------------------------------------
echo -n "10/10 Live: airport_routes (JFK)..."
if [ -z "$AMADEUS_TOKEN" ]; then
  skip "no token"
else
  RESULT=$(curl -sf "$AMADEUS_BASE/v1/airport/direct-destinations?departureAirportCode=JFK" \
    -H "Authorization: Bearer $AMADEUS_TOKEN" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "iataCode\|data"; then
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
