#!/bin/bash
# Smoke test for BTS Transportation Statistics (UC-564)
# Tests: health, catalog presence, schema, live API calls

set -e
BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local name="$1"; local cmd="$2"; local expect="$3"
  local result
  result=$(eval "$cmd" 2>/dev/null)
  if echo "$result" | grep -q "$expect"; then
    echo "  PASS: $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $name — expected '$expect', got: $result"
    FAIL=$((FAIL+1))
  fi
}

echo "=== BTS Transport Smoke Test ==="
echo ""

echo "1. Health check"
check "health ready" "curl -s $BASE/health/ready | python3 -c \"import sys,json; print(json.load(sys.stdin).get('status','?'))\"" "ready"

echo ""
echo "2. Catalog presence (4 BTS tools)"
check "bts tools in catalog" "curl -s '$BASE/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); bts=[t['id'] for t in d['data'] if t['id'].startswith('bts.')]; print(len(bts))\"" "4"

echo ""
echo "3. Tool detail endpoints"
check "bts.border_crossings detail" "curl -s $BASE/api/v1/tools/bts.border_crossings | python3 -c \"import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))\"" "True"
check "bts.tsi detail" "curl -s $BASE/api/v1/tools/bts.tsi | python3 -c \"import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))\"" "True"
check "bts.freight_indicators detail" "curl -s $BASE/api/v1/tools/bts.freight_indicators | python3 -c \"import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))\"" "True"
check "bts.aviation_traffic detail" "curl -s $BASE/api/v1/tools/bts.aviation_traffic | python3 -c \"import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))\"" "True"

echo ""
echo "4. Live API calls (TEST_API_KEY required)"
if [ -n "$TEST_API_KEY" ]; then
  check "border crossings Mexico" \
    "curl -s -X POST $BASE/api/v1/tools/bts.border_crossings/call -H 'Authorization: Bearer $TEST_API_KEY' -H 'Content-Type: application/json' -d '{\"border\":\"US-Mexico Border\",\"measure\":\"Personal Vehicles\",\"limit\":3}' | python3 -c \"import sys,json; d=json.load(sys.stdin); r=d.get('result',{}); print(r.get('count',0))\"" "3"

  check "TSI latest 3 months" \
    "curl -s -X POST $BASE/api/v1/tools/bts.tsi/call -H 'Authorization: Bearer $TEST_API_KEY' -H 'Content-Type: application/json' -d '{\"limit\":3}' | python3 -c \"import sys,json; d=json.load(sys.stdin); r=d.get('result',{}); print(len(r.get('index',[])))\"" "3"

  check "freight indicators containerized" \
    "curl -s -X POST $BASE/api/v1/tools/bts.freight_indicators/call -H 'Authorization: Bearer $TEST_API_KEY' -H 'Content-Type: application/json' -d '{\"indicator\":\"Containerized Imports\",\"limit\":5}' | python3 -c \"import sys,json; d=json.load(sys.stdin); r=d.get('result',{}); print(r.get('count',0)>0)\"" "True"

  check "aviation ATL 2025" \
    "curl -s -X POST $BASE/api/v1/tools/bts.aviation_traffic/call -H 'Authorization: Bearer $TEST_API_KEY' -H 'Content-Type: application/json' -d '{\"airport_code\":\"ATL\",\"year\":\"2025\"}' | python3 -c \"import sys,json; d=json.load(sys.stdin); r=d.get('result',{}); print(r.get('count',0)>0)\"" "True"
else
  echo "  SKIP: Set TEST_API_KEY env var for live execution tests"
fi

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
