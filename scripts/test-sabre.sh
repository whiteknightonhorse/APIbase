#!/bin/bash
# APIbase.pro — Sabre GDS Smoke Tests (UC-023)
#
# Verifies Sabre adapter integration:
#   Tests 1-4: Catalog presence, tool details (REST)
#   Tests 5-8: Live Sabre API calls (direct, validates credentials)
#
# Usage:
#   API_URL=https://apibase.pro ./scripts/test-sabre.sh
#
# Environment:
#   API_URL            — Base URL (default: https://apibase.pro)
#   SABRE_CLIENT_ID    — Sabre OAuth2 client ID
#   SABRE_CLIENT_SECRET — Sabre OAuth2 client secret
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
SABRE_CLIENT_ID="${SABRE_CLIENT_ID:-}"
SABRE_CLIENT_SECRET="${SABRE_CLIENT_SECRET:-}"
SABRE_BASE="https://api-crt.cert.havail.sabre.com"
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
CATALOG=$(curl -s -H "Accept: application/json" "$API_URL/api/v1/tools?limit=100" 2>/dev/null || echo "{}")
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
# Helper: get Sabre OAuth2 token (double base64 encoding)
# ---------------------------------------------------------------------------
get_sabre_token() {
  if [ -z "$SABRE_CLIENT_ID" ] || [ -z "$SABRE_CLIENT_SECRET" ]; then
    return 1
  fi
  ENCODED_ID=$(echo -n "$SABRE_CLIENT_ID" | base64)
  ENCODED_SECRET=$(echo -n "$SABRE_CLIENT_SECRET" | base64)
  CREDENTIALS=$(echo -n "${ENCODED_ID}:${ENCODED_SECRET}" | base64)
  curl -sf -X POST "$SABRE_BASE/v2/auth/token" \
    -H "Authorization: Basic $CREDENTIALS" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials" 2>/dev/null \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])" 2>/dev/null
}

# ---------------------------------------------------------------------------
# 5. Live: sabre.airline_lookup AA
# ---------------------------------------------------------------------------
echo -n "5/8 Live: sabre.airline_lookup (AA)..."
SABRE_TOKEN=$(get_sabre_token 2>/dev/null || echo "")
if [ -z "$SABRE_CLIENT_ID" ] || [ -z "$SABRE_CLIENT_SECRET" ]; then
  skip "SABRE_CLIENT_ID/SECRET not set"
elif [ -z "$SABRE_TOKEN" ]; then
  fail "could not obtain Sabre OAuth2 token"
else
  RESULT=$(curl -sf "$SABRE_BASE/v1/lists/utilities/airlines?airlinecode=AA" \
    -H "Authorization: Bearer $SABRE_TOKEN" 2>/dev/null || echo "{}")
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
if [ -z "$SABRE_TOKEN" ]; then
  skip "no token"
else
  DEPART=$(date -d "+30 days" +%Y-%m-%d 2>/dev/null || date -v+30d +%Y-%m-%d 2>/dev/null || echo "2026-04-15")
  RESULT=$(curl -s "$SABRE_BASE/v1/shop/flights?origin=JFK&destination=LHR&departuredate=$DEPART&pointofsalecountry=US&limit=5" \
    -H "Authorization: Bearer $SABRE_TOKEN" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -qi "PricedItinerar\|TotalFare\|Amount\|No results"; then
    pass
  else
    fail "expected flight data or 'No results', got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 7. Live: sabre.travel_themes
# ---------------------------------------------------------------------------
echo -n "7/8 Live: sabre.travel_themes..."
if [ -z "$SABRE_TOKEN" ]; then
  skip "no token"
else
  RESULT=$(curl -sf "$SABRE_BASE/v1/shop/themes" \
    -H "Authorization: Bearer $SABRE_TOKEN" 2>/dev/null || echo "{}")
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
if [ -z "$SABRE_TOKEN" ]; then
  skip "no token"
else
  DEPART=$(date -d "+30 days" +%Y-%m-%d 2>/dev/null || date -v+30d +%Y-%m-%d 2>/dev/null || echo "2026-04-15")
  RETURN=$(date -d "+37 days" +%Y-%m-%d 2>/dev/null || date -v+37d +%Y-%m-%d 2>/dev/null || echo "2026-04-22")
  RESULT=$(curl -sf "$SABRE_BASE/v2/shop/flights/fares?origin=JFK&departuredate=$DEPART&returndate=$RETURN&pointofsalecountry=US" \
    -H "Authorization: Bearer $SABRE_TOKEN" 2>/dev/null || echo "{}")
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
