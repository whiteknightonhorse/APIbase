#!/usr/bin/env bash
# UC-054 Open Library Books/ISBN — Pipeline API tests
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

echo "=== UC-054 Open Library Books/ISBN Tests ==="
echo ""

echo "1/4 books.isbn_lookup..."
RESP=$(call_tool "books.isbn_lookup" '{"isbn": "9780451524935"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "ISBN lookup (1984)" "$STATUS" "$BODY" "'1984' in d.get('data',{}).get('title','').lower() or 'nineteen' in d.get('data',{}).get('title','').lower()"

sleep 1

echo "2/4 books.search..."
RESP=$(call_tool "books.search" '{"query": "dune frank herbert", "limit": 3}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Book search (Dune)" "$STATUS" "$BODY" "d.get('data',{}).get('total',0) > 0"

sleep 1

echo "3/4 books.work_details..."
RESP=$(call_tool "books.work_details" '{"olid": "OL45804W"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Work details (LOTR)" "$STATUS" "$BODY" "d.get('data',{}).get('title') is not None"

sleep 1

echo "4/4 books.author..."
RESP=$(call_tool "books.author" '{"olid": "OL23919A"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "Author (Tolkien)" "$STATUS" "$BODY" "'Tolkien' in d.get('data',{}).get('name','')"

echo ""
echo "=== Results: $PASS PASS, $FAIL FAIL, $SKIP SKIP ==="
[ "$FAIL" -eq 0 ] || exit 1
