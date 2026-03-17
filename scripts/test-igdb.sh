#!/usr/bin/env bash
# UC-039 IGDB Video Games Database — Pipeline API tests
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

echo "=== UC-039 IGDB Video Games Database Tests ==="
echo ""

# --- 1. Game Search ---
echo "1/5 igdb.game_search..."
RESP=$(call_tool "igdb.game_search" '{"query": "cyberpunk", "limit": 3}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "IGDB game_search" "$STATUS" "$BODY" "isinstance(d.get('data'), list) and len(d['data']) > 0"

# --- 2. Game Details ---
echo "2/5 igdb.game_details..."
RESP=$(call_tool "igdb.game_details" '{"id": 1877}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "IGDB game_details" "$STATUS" "$BODY" "d.get('data',{}).get('name') == 'Cyberpunk 2077'"

# --- 3. Company Info ---
echo "3/5 igdb.company_info..."
RESP=$(call_tool "igdb.company_info" '{"id": 70}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "IGDB company_info" "$STATUS" "$BODY" "d.get('data',{}).get('name') == 'Nintendo'"

# --- 4. Platform Info ---
echo "4/5 igdb.platform_info..."
RESP=$(call_tool "igdb.platform_info" '{"id": 48}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "IGDB platform_info" "$STATUS" "$BODY" "d.get('data',{}).get('name') == 'PlayStation 4'"

# --- 5. Game Media ---
echo "5/5 igdb.game_media..."
RESP=$(call_tool "igdb.game_media" '{"id": 1877}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "IGDB game_media" "$STATUS" "$BODY" "d.get('data',{}).get('name') == 'Cyberpunk 2077'"

echo ""
echo "=== Results: $PASS PASS, $FAIL FAIL, $SKIP SKIP ==="
[ "$FAIL" -eq 0 ] || exit 1
