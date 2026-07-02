#!/usr/bin/env bash
# Smoke test for European Parliament Open Data (UC-588)
set -euo pipefail

BASE="https://apibase.pro"
PROVIDER="eu_parliament"
TOOLS=("eu_parliament.meps.list" "eu_parliament.meps.details" "eu_parliament.legislation.adopted_texts" "eu_parliament.legislation.procedures")
PASS=0; FAIL=0

check() {
  local desc="$1" result="$2"
  if [ "$result" = "1" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc"; FAIL=$((FAIL+1))
  fi
}

echo "=== EU Parliament Open Data Smoke Tests ==="

# 1. Health
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health/ready")
check "Health check 200" "$([ "$HTTP" = "200" ] && echo 1 || echo 0)"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ep=[t for t in d['data'] if t['id'].startswith('eu_parliament')]
print(len(ep))
" 2>/dev/null)
check "4 eu_parliament tools in catalog" "$([ "$COUNT" = "4" ] && echo 1 || echo 0)"

# 3. Tool detail endpoints
for TOOL in "${TOOLS[@]}"; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  check "Tool detail $TOOL returns 200" "$([ "$HTTP" = "200" ] && echo 1 || echo 0)"
done

# 4. Input schema populated (not empty)
SCHEMA=$(curl -s "$BASE/api/v1/tools/eu_parliament.meps.list" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print(len(props))
" 2>/dev/null)
check "meps.list has 6 schema properties" "$([ "$SCHEMA" = "6" ] && echo 1 || echo 0)"

# 5. Live upstream check (no auth, directly hit API)
HTTP_UP=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://data.europarl.europa.eu/api/v2/meps/show-current?format=application/ld%2Bjson&limit=1")
check "Upstream EP API reachable (200)" "$([ "$HTTP_UP" = "200" ] && echo 1 || echo 0)"

# 6. 402 on paid call (no key)
HTTP_PAY=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/v1/tools/eu_parliament.meps.list/call" \
  -H "Authorization: Bearer ak_live_test123" \
  -H "Content-Type: application/json" \
  -d '{"country":"DE","limit":2}')
check "Paid call returns 401/402 without valid key" "$(echo "$HTTP_PAY" | grep -qE "401|402" && echo 1 || echo 0)"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
