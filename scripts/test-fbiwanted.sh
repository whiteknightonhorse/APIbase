#!/usr/bin/env bash
# Smoke tests for FBI Wanted API (UC-738)
set -euo pipefail

BASE="${BASE:-https://apibase.pro}"
TEST_API_KEY="${TEST_API_KEY:-}"
PASS=0; FAIL=0
UA='Mozilla/5.0 (compatible; APIbase-Test/1.0)'

check() {
  local label="$1"; local result="$2"; local expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "PASS: $label"; PASS=$((PASS+1))
  else
    echo "FAIL: $label — got: ${result:0:200}"; FAIL=$((FAIL+1))
  fi
}

echo "=== FBI Wanted API Smoke Tests ($BASE) ==="

# 1. Health check
R=$(curl -s "$BASE/health/ready")
check "health ready" "$R" '"status":"ready"'

# 2. fbiwanted tools in catalog (expect 3)
R=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); fw=[t for t in d['data'] if t['id'].startswith('fbiwanted.')]; print(f'fbiwanted_count={len(fw)}')")
check "fbiwanted tools count=3" "$R" "fbiwanted_count=3"

# 3. Tool detail — search
R=$(curl -s "$BASE/api/v1/tools/fbiwanted.search")
check "fbiwanted.search detail" "$R" '"id":"fbiwanted.search"'
check "fbiwanted.search schema" "$R" '"field_office"'

# 4. Tool detail — by_category
R=$(curl -s "$BASE/api/v1/tools/fbiwanted.by_category")
check "fbiwanted.by_category detail" "$R" '"id":"fbiwanted.by_category"'
check "fbiwanted.by_category schema (ten most wanted enum)" "$R" '"ten"'

# 5. Tool detail — recent
R=$(curl -s "$BASE/api/v1/tools/fbiwanted.recent")
check "fbiwanted.recent detail" "$R" '"id":"fbiwanted.recent"'

# 6. Live upstream by_category (direct, User-Agent required — api.fbi.gov WAF
#    403s any request without one)
R=$(curl -s -A "$UA" "https://api.fbi.gov/wanted/v1/list?poster_classification=ten&pageSize=1")
check "upstream ten-most-wanted returns a subject" "$R" '"title"'

# 7. Live upstream search (direct)
R=$(curl -s -A "$UA" "https://api.fbi.gov/wanted/v1/list?title=smith&pageSize=1")
check "upstream title search returns a match" "$R" '"uid"'

# 8. Live end-to-end tool call (requires TEST_API_KEY)
if [ -n "$TEST_API_KEY" ]; then
  R=$(curl -s -X POST "$BASE/api/v1/tools/fbiwanted.by_category/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"category":"ten","page_size":1}')
  check "live fbiwanted.by_category call" "$R" '"results"'
else
  echo "SKIP: live tool call (no TEST_API_KEY set)"
fi

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || exit 1
