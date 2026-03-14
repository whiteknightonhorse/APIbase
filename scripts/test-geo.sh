#!/usr/bin/env bash
# UC-012 Maps / Navigation / Geolocation — Pipeline API tests
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

echo "=== UC-012 Maps / Navigation / Geolocation Tests ==="
echo ""

# --- 1. Geocode ---
echo "1/7 Geoapify geocode..."
RESP=$(call_tool "geo.geocode" '{"text": "1600 Pennsylvania Avenue, Washington DC", "limit": 1}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Geoapify geocode" "$STATUS" "$BODY" "'features' in d.get('data',{}) and len(d['data']['features']) > 0"

# --- 2. Reverse Geocode ---
echo "2/7 Geoapify reverse_geocode..."
RESP=$(call_tool "geo.reverse_geocode" '{"lat": 48.8566, "lon": 2.3522}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Geoapify reverse_geocode" "$STATUS" "$BODY" "'features' in d.get('data',{}) and len(d['data']['features']) > 0"

# --- 3. Place Search ---
echo "3/7 Geoapify place_search..."
RESP=$(call_tool "geo.place_search" '{"categories": "catering.restaurant", "lat": 40.7128, "lon": -74.006, "radius": 500, "limit": 5}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Geoapify place_search" "$STATUS" "$BODY" "'features' in d.get('data',{})"

# --- 4. Autocomplete ---
echo "4/7 Geoapify autocomplete..."
RESP=$(call_tool "geo.autocomplete" '{"text": "Berlin Bran", "limit": 3}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Geoapify autocomplete" "$STATUS" "$BODY" "'features' in d.get('data',{})"

# --- 5. Routing ---
echo "5/7 Geoapify routing..."
RESP=$(call_tool "geo.routing" '{"origin_lat": 52.52, "origin_lon": 13.405, "dest_lat": 48.8566, "dest_lon": 2.3522, "mode": "drive"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Geoapify routing" "$STATUS" "$BODY" "'features' in d.get('data',{})"

# --- 6. Isochrone ---
echo "6/7 Geoapify isochrone..."
RESP=$(call_tool "geo.isochrone" '{"lat": 51.5074, "lon": -0.1278, "mode": "drive", "time": 600}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Geoapify isochrone" "$STATUS" "$BODY" "'features' in d.get('data',{})"

# --- 7. IP Geolocation ---
echo "7/7 Geoapify ip_geolocation..."
RESP=$(call_tool "geo.ip_geolocation" '{"ip": "8.8.8.8"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Geoapify ip_geolocation" "$STATUS" "$BODY" "'ip' in d.get('data',{})"

echo ""
echo "=== Results: $PASS PASS, $SKIP SKIP, $FAIL FAIL ==="
[ "$FAIL" -eq 0 ] && green "ALL OK (${PASS} working, ${SKIP} skipped)" || red "SOME FAILED"
exit "$FAIL"
