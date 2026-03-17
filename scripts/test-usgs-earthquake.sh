#!/usr/bin/env bash
# UC-048 USGS Earthquake Hazards Program — Pipeline API tests
set -euo pipefail

PASS=0
FAIL=0
SKIP=0
BASE="https://apibase.pro"
API_KEY="${TEST_API_KEY:-ak_live_00000000000000000000000000000000}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$1"; }

call_tool() {
  local tool="$1" body="$2"
  curl -s -w "\n%{http_code}" "$BASE/api/v1/tools/$tool/call" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "$body"
}

check() {
  local name="$1" status="$2" body="$3" field="$4"
  if [ "$status" -eq 200 ] && echo "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); assert $field" 2>/dev/null; then
    green "PASS: $name (HTTP $status)"
    PASS=$((PASS + 1))
  elif [ "$status" -eq 502 ]; then
    yellow "SKIP: $name (HTTP 502 — provider unavailable)"
    SKIP=$((SKIP + 1))
  else
    red "FAIL: $name (HTTP $status)"
    echo "$body" | head -c 300
    echo
    FAIL=$((FAIL + 1))
  fi
}

echo "=== UC-048 USGS Earthquake Hazards Program Tests ==="
echo ""

# --- 1. Earthquake Search ---
echo "1/3 earthquake.search..."
RESP=$(call_tool "earthquake.search" '{"minmagnitude": 5, "limit": 3, "orderby": "time"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Earthquake search (M5+)" "$STATUS" "$BODY" "d.get('data',{}).get('count',0) > 0 and len(d['data'].get('earthquakes',[])) > 0"

# --- 2. Earthquake Feed ---
echo "2/3 earthquake.feed..."
RESP=$(call_tool "earthquake.feed" '{"magnitude": "4.5", "timeframe": "day"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Earthquake feed (M4.5+ today)" "$STATUS" "$BODY" "isinstance(d.get('data',{}).get('earthquakes'), list)"

# --- 3. Earthquake Count ---
echo "3/3 earthquake.count..."
RESP=$(call_tool "earthquake.count" '{"minmagnitude": 4, "starttime": "2026-03-01"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Earthquake count (M4+ since March)" "$STATUS" "$BODY" "d.get('data',{}).get('count',0) > 0"

echo ""
echo "=== Results: $PASS PASS, $FAIL FAIL, $SKIP SKIP ==="
[ "$FAIL" -eq 0 ] || exit 1
