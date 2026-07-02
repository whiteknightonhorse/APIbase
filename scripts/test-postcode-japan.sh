#!/bin/bash
# Smoke tests for Japan Postal Codes (UC-591)
set -e

BASE="https://apibase.pro"
PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0)" 2>/dev/null; then
    echo "PASS: $label"
    PASS=$((PASS+1))
  else
    echo "FAIL: $label"
    echo "  Response: $result"
    FAIL=$((FAIL+1))
  fi
}

# 1. Health
echo "=== Health ==="
curl -sf "$BASE/health/ready" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['status']=='ready'" && echo "PASS: health" && PASS=$((PASS+1)) || { echo "FAIL: health"; FAIL=$((FAIL+1)); }

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([t for t in d['data'] if t['provider']=='postcode-japan']))")
if [ "$COUNT" -eq 3 ]; then
  echo "PASS: catalog has 3 postcode-japan tools"
  PASS=$((PASS+1))
else
  echo "FAIL: expected 3 tools, got $COUNT"
  FAIL=$((FAIL+1))
fi

# 3. Tool detail with schema
check "tool detail postcode-japan.lookup" "$(curl -s "$BASE/api/v1/tools/postcode-japan.lookup")"
check "tool detail postcode-japan.search" "$(curl -s "$BASE/api/v1/tools/postcode-japan.search")"
check "tool detail postcode-japan.prefectures" "$(curl -s "$BASE/api/v1/tools/postcode-japan.prefectures")"

echo ""
echo "=== Results ==="
echo "Passed: $PASS/$((PASS+FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "FAILED: $FAIL tests failed"
  exit 1
else
  echo "All tests passed"
fi
