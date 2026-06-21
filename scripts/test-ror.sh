#!/bin/bash
# Smoke test for ROR (Research Organization Registry) — UC-491
set -e

BASE="https://apibase.pro"
PROVIDER="ror"
TOOLS=("ror.search" "ror.get" "ror.filter" "ror.affiliation")
PASS=0; FAIL=0; true

check() {
  local label="$1"; local url="$2"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [[ "$status" == "200" ]]; then
    echo "PASS: $label ($status)"
    PASS=$((PASS+1))
  else
    echo "FAIL: $label (HTTP $status)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== ROR Smoke Tests ==="

# 1. Health
check "Health" "$BASE/health/ready"

# 2. Provider in tool catalog
TOOL_COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t['id'].startswith('ror.')))
")
if [[ "$TOOL_COUNT" == "4" ]]; then
  echo "PASS: ROR has 4 tools in catalog"
  PASS=$((PASS+1))
else
  echo "FAIL: ROR tool count=$TOOL_COUNT (expected 4)"
  FAIL=$((FAIL+1))
fi

# 3. Tool detail endpoints
for tid in "${TOOLS[@]}"; do
  check "Tool detail: $tid" "$BASE/api/v1/tools/$tid"
done

# 4. Live API calls (require TEST_API_KEY)
if [[ -n "$TEST_API_KEY" ]]; then
  echo "--- Live API calls ---"
  # search
  RES=$(curl -s -X POST "$BASE/api/v1/tools/ror.search/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"query":"MIT"}')
  TOTAL=$(echo "$RES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('total',0))" 2>/dev/null)
  if [[ "$TOTAL" -gt 0 ]]; then
    echo "PASS: ror.search MIT → $TOTAL results"
    PASS=$((PASS+1))
  else
    echo "FAIL: ror.search returned 0 results"
    FAIL=$((FAIL+1))
  fi

  # get
  RES=$(curl -s -X POST "$BASE/api/v1/tools/ror.get/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"ror_id":"042nb2s44"}')
  NAME=$(echo "$RES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('name',''))" 2>/dev/null)
  if [[ "$NAME" == *"Technology"* ]]; then
    echo "PASS: ror.get → $NAME"
    PASS=$((PASS+1))
  else
    echo "FAIL: ror.get → '$NAME' (expected MIT)"
    FAIL=$((FAIL+1))
  fi

  # filter
  RES=$(curl -s -X POST "$BASE/api/v1/tools/ror.filter/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"types":"Education","country_code":"US"}')
  TOTAL=$(echo "$RES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('total',0))" 2>/dev/null)
  if [[ "$TOTAL" -gt 0 ]]; then
    echo "PASS: ror.filter Education/US → $TOTAL results"
    PASS=$((PASS+1))
  else
    echo "FAIL: ror.filter returned 0 results"
    FAIL=$((FAIL+1))
  fi

  # affiliation
  RES=$(curl -s -X POST "$BASE/api/v1/tools/ror.affiliation/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"affiliation":"Massachusetts Institute of Technology"}')
  COUNT=$(echo "$RES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('total',0))" 2>/dev/null)
  if [[ "$COUNT" -gt 0 ]]; then
    echo "PASS: ror.affiliation → $COUNT matches"
    PASS=$((PASS+1))
  else
    echo "FAIL: ror.affiliation returned 0 matches"
    FAIL=$((FAIL+1))
  fi
else
  echo "Skipping live calls (set TEST_API_KEY to enable)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
