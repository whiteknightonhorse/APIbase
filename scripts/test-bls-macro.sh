#!/usr/bin/env bash
# BLS Macro (UC-509) smoke test
set -euo pipefail

BASE="https://apibase.pro"
PROVIDER="bls-macro"
TOOLS=("bls-macro.series" "bls-macro.cpi" "bls-macro.unemployment" "bls-macro.payrolls")
PASS=0; FAIL=0

check() {
  local label="$1"; local url="$2"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [[ "$status" == "200" ]]; then
    echo "  PASS [$label] HTTP $status"
    PASS=$((PASS+1))
  else
    echo "  FAIL [$label] HTTP $status (expected 200)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== BLS Macro (UC-509) smoke test ==="
echo ""

# 1. Health
echo "1/4 Health check..."
check "health" "$BASE/health/ready"

# 2. Provider tools in catalog
echo "2/4 Tools in catalog..."
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
bls=[t for t in d['data'] if t['id'].startswith('bls-macro.')]
print(len(bls))
")
if [[ "$COUNT" == "4" ]]; then
  echo "  PASS [$PROVIDER tools in catalog] count=$COUNT"
  PASS=$((PASS+1))
else
  echo "  FAIL [$PROVIDER tools in catalog] count=$COUNT (expected 4)"
  FAIL=$((FAIL+1))
fi

# 3. Tool detail endpoints (schema populated)
echo "3/4 Tool detail endpoints..."
for TOOL in "${TOOLS[@]}"; do
  RESP=$(curl -s "$BASE/api/v1/tools/$TOOL")
  HAS_SCHEMA=$(echo "$RESP" | python3 -c "import sys,json; t=json.load(sys.stdin); print('yes' if t.get('input_schema',{}).get('properties') else 'no')" 2>/dev/null || echo "error")
  if [[ "$HAS_SCHEMA" == "yes" ]]; then
    echo "  PASS [$TOOL schema]"
    PASS=$((PASS+1))
  else
    echo "  FAIL [$TOOL schema] no input_schema.properties"
    FAIL=$((FAIL+1))
  fi
done

# 4. Live API call (expect 402 payment required or real data)
echo "4/4 Live API call (payment enforcement)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/tools/bls-macro.cpi/call" \
  -H "Content-Type: application/json" \
  -d '{"item":"all","start_year":2023,"end_year":2024}')
# No auth → 401, with free agent → 402 (payment required), both prove tool is registered
if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "402" || "$HTTP_CODE" == "200" ]]; then
  echo "  PASS [bls-macro.cpi live call] HTTP $HTTP_CODE (tool registered and reachable)"
  PASS=$((PASS+1))
else
  echo "  FAIL [bls-macro.cpi live call] HTTP $HTTP_CODE (unexpected)"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== Results ==="
echo "Passed: $PASS | Failed: $FAIL"
[[ "$FAIL" == "0" ]] && echo "=== All BLS Macro tests passed ===" || { echo "=== FAILURES DETECTED ==="; exit 1; }
