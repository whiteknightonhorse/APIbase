#!/usr/bin/env bash
# UC-051 Jikan (MyAnimeList) Anime/Manga — Pipeline API tests
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

echo "=== UC-051 Jikan Anime/Manga Database Tests ==="
echo ""

echo "1/5 anime.search..."
RESP=$(call_tool "anime.search" '{"query": "naruto", "limit": 3}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Anime search" "$STATUS" "$BODY" "len(d.get('data',{}).get('results',[])) > 0"

sleep 1

echo "2/5 anime.details..."
RESP=$(call_tool "anime.details" '{"id": 1}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Anime details (Cowboy Bebop)" "$STATUS" "$BODY" "d.get('data',{}).get('title') == 'Cowboy Bebop'"

sleep 1

echo "3/5 manga.details..."
RESP=$(call_tool "manga.details" '{"id": 13}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Manga details (One Piece)" "$STATUS" "$BODY" "d.get('data',{}).get('title') == 'One Piece'"

sleep 1

echo "4/5 anime.characters..."
RESP=$(call_tool "anime.characters" '{"id": 1}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Anime characters" "$STATUS" "$BODY" "d.get('data',{}).get('count',0) > 0"

sleep 1

echo "5/5 anime.top..."
RESP=$(call_tool "anime.top" '{"limit": 3}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Anime top" "$STATUS" "$BODY" "len(d.get('data',{}).get('results',[])) > 0"

echo ""
echo "=== Results: $PASS PASS, $FAIL FAIL, $SKIP SKIP ==="
[ "$FAIL" -eq 0 ] || exit 1
