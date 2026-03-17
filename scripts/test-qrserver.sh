#!/usr/bin/env bash
# UC-040 QRServer QR Code Generator & Reader — Pipeline API tests
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

echo "=== UC-040 QRServer QR Code Generator & Reader Tests ==="
echo ""

# --- 1. Generate QR Code ---
echo "1/2 qrserver.generate..."
RESP=$(call_tool "qrserver.generate" '{"data": "https://apibase.pro"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "QRServer generate" "$STATUS" "$BODY" "'url' in d.get('data', {}) and 'apibase.pro' in d['data']['url']"

# --- 2. Read QR Code ---
echo "2/2 qrserver.read..."
RESP=$(call_tool "qrserver.read" '{"fileurl": "https://api.qrserver.com/v1/create-qr-code/?data=https://apibase.pro&size=150x150"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "QRServer read" "$STATUS" "$BODY" "d.get('data', {}).get('data') == 'https://apibase.pro'"

echo ""
echo "=== Results: $PASS PASS, $FAIL FAIL, $SKIP SKIP ==="
[ "$FAIL" -eq 0 ] || exit 1
