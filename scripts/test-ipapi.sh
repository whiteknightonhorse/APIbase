#!/usr/bin/env bash
# UC-045 ipapi.is IP Intelligence — Pipeline API tests
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

echo "=== UC-045 ipapi.is IP Intelligence Tests ==="
echo ""

# --- 1. IP Lookup ---
echo "1/2 ip.lookup..."
RESP=$(call_tool "ip.lookup" '{"ip": "8.8.8.8"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "IP lookup (Google DNS)" "$STATUS" "$BODY" "d.get('data',{}).get('ip') == '8.8.8.8' and d['data'].get('security',{}).get('is_datacenter') == True"

# --- 2. Bulk Lookup ---
echo "2/2 ip.bulk_lookup..."
RESP=$(call_tool "ip.bulk_lookup" '{"ips": ["8.8.8.8", "1.1.1.1"]}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "IP bulk lookup" "$STATUS" "$BODY" "d.get('data',{}).get('count',0) == 2"

echo ""
echo "=== Results: $PASS PASS, $FAIL FAIL, $SKIP SKIP ==="
[ "$FAIL" -eq 0 ] || exit 1
