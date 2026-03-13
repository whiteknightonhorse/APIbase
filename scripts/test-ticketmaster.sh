#!/bin/bash
# APIbase.pro — Ticketmaster Discovery API Smoke Tests (UC-008)
#
# Verifies Ticketmaster adapter integration:
#   Tests 1-4: Catalog presence, tool details (REST)
#   Tests 5-11: Live Ticketmaster Discovery API calls (direct)
#
# Usage:
#   API_URL=https://apibase.pro ./scripts/test-ticketmaster.sh
#
# Environment:
#   API_URL                    — Base URL (default: https://apibase.pro)
#   PROVIDER_KEY_TICKETMASTER  — Ticketmaster Consumer Key (optional, sourced from .env)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
TM_BASE="https://app.ticketmaster.com"
TM_KEY="${PROVIDER_KEY_TICKETMASTER:-}"
PASSED=0
FAILED=0
SKIPPED=0

pass() { echo "  PASS"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL: $1"; FAILED=$((FAILED + 1)); }
skip() { echo "  SKIP: $1"; SKIPPED=$((SKIPPED + 1)); }

echo "=== Ticketmaster Discovery API Smoke Tests (UC-008) ==="
echo "Target: $API_URL"
echo ""

# ---------------------------------------------------------------------------
# 1. Health check
# ---------------------------------------------------------------------------
echo -n "1/11 Health readiness..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/ready" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 2. Ticketmaster tools in catalog (expect 7)
# ---------------------------------------------------------------------------
echo -n "2/11 Ticketmaster tools in catalog..."
CATALOG=$(curl -s -H "Accept: application/json" "$API_URL/api/v1/tools?limit=100" 2>/dev/null || echo "{}")
TM_COUNT=$(echo "$CATALOG" | grep -o '"ticketmaster\.' | wc -l)
if [ "$TM_COUNT" -ge 7 ]; then
  pass
else
  fail "expected >= 7 ticketmaster tools, found $TM_COUNT"
fi

# ---------------------------------------------------------------------------
# 3. Tool detail: ticketmaster.events_search
# ---------------------------------------------------------------------------
echo -n "3/11 Tool detail ticketmaster.events_search..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/ticketmaster.events_search" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 4. Tool detail: ticketmaster.events_categories
# ---------------------------------------------------------------------------
echo -n "4/11 Tool detail ticketmaster.events_categories..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/ticketmaster.events_categories" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 5. Live: events search (concert)
# ---------------------------------------------------------------------------
echo -n "5/11 Live: events search (concert)..."
if [ -z "$TM_KEY" ]; then
  skip "PROVIDER_KEY_TICKETMASTER not set"
else
  RESULT=$(curl -sf "$TM_BASE/discovery/v2/events.json?apikey=$TM_KEY&keyword=concert&size=2" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -q '"page"'; then
    pass
  else
    fail "expected page metadata, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 6. Live: event details
# ---------------------------------------------------------------------------
echo -n "6/11 Live: event details..."
if [ -z "$TM_KEY" ]; then
  skip "PROVIDER_KEY_TICKETMASTER not set"
else
  # Get first event ID from search
  EVENT_ID=$(curl -sf "$TM_BASE/discovery/v2/events.json?apikey=$TM_KEY&keyword=concert&size=1" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('_embedded',{}).get('events',[{}])[0].get('id',''))" 2>/dev/null || echo "")
  if [ -n "$EVENT_ID" ]; then
    RESULT=$(curl -sf "$TM_BASE/discovery/v2/events/$EVENT_ID.json?apikey=$TM_KEY" 2>/dev/null || echo "{}")
    if echo "$RESULT" | grep -q '"name"'; then
      pass
    else
      fail "expected event name, got: $(echo "$RESULT" | head -c 200)"
    fi
  else
    fail "could not get event ID from search"
  fi
fi

# ---------------------------------------------------------------------------
# 7. Live: events nearby (NYC)
# ---------------------------------------------------------------------------
echo -n "7/11 Live: events nearby (NYC)..."
if [ -z "$TM_KEY" ]; then
  skip "PROVIDER_KEY_TICKETMASTER not set"
else
  RESULT=$(curl -sf "$TM_BASE/discovery/v2/events.json?apikey=$TM_KEY&latlong=40.7128,-74.0060&radius=10&unit=miles&size=2" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -q '"totalElements"'; then
    pass
  else
    fail "expected page metadata, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 8. Live: artist events (Coldplay)
# ---------------------------------------------------------------------------
echo -n "8/11 Live: artist events (Coldplay)..."
if [ -z "$TM_KEY" ]; then
  skip "PROVIDER_KEY_TICKETMASTER not set"
else
  RESULT=$(curl -sf "$TM_BASE/discovery/v2/events.json?apikey=$TM_KEY&keyword=Coldplay&size=2" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -q '"page"'; then
    pass
  else
    fail "expected page metadata, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 9. Live: trending events
# ---------------------------------------------------------------------------
echo -n "9/11 Live: trending events..."
if [ -z "$TM_KEY" ]; then
  skip "PROVIDER_KEY_TICKETMASTER not set"
else
  RESULT=$(curl -sf "$TM_BASE/discovery/v2/events.json?apikey=$TM_KEY&sort=relevance,desc&size=3" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -q '"page"'; then
    pass
  else
    fail "expected page metadata, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 10. Live: categories (classifications)
# ---------------------------------------------------------------------------
echo -n "10/11 Live: event categories..."
if [ -z "$TM_KEY" ]; then
  skip "PROVIDER_KEY_TICKETMASTER not set"
else
  RESULT=$(curl -sf "$TM_BASE/discovery/v2/classifications.json?apikey=$TM_KEY&size=10" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -q '"Music"'; then
    pass
  else
    fail "expected Music category, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 11. Live: events by country (GB)
# ---------------------------------------------------------------------------
echo -n "11/11 Live: events in UK..."
if [ -z "$TM_KEY" ]; then
  skip "PROVIDER_KEY_TICKETMASTER not set"
else
  RESULT=$(curl -sf "$TM_BASE/discovery/v2/events.json?apikey=$TM_KEY&countryCode=GB&size=2" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -q '"page"'; then
    pass
  else
    fail "expected page metadata, got: $(echo "$RESULT" | head -c 200)"
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
echo "Ticketmaster Discovery API integration OK"
