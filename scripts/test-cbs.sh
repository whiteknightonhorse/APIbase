#!/usr/bin/env bash
# CBS Netherlands (Statistics Netherlands) OData v3 API — smoke tests
# UC-432

set -euo pipefail
BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"
  if [ "$result" = "0" ]; then
    echo "PASS: $label"; PASS=$((PASS+1))
  else
    echo "FAIL: $label"; FAIL=$((FAIL+1))
  fi
}

echo "=== CBS Netherlands smoke tests ==="

# 1. Health check
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health/ready")
check "Health check 200" "$([ "$HTTP" = "200" ] && echo 0 || echo 1)"

# 2. CBS tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
cbs=[t for t in d['data'] if t['id'].startswith('cbs.')]
print(len(cbs))
")
check "3 CBS tools in catalog" "$([ "$COUNT" = "3" ] && echo 0 || echo 1)"

# 3. Tool detail: cbs.catalog_search
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/cbs.catalog_search")
check "cbs.catalog_search detail 200" "$([ "$HTTP" = "200" ] && echo 0 || echo 1)"

# 4. Tool detail: cbs.table_metadata
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/cbs.table_metadata")
check "cbs.table_metadata detail 200" "$([ "$HTTP" = "200" ] && echo 0 || echo 1)"

# 5. Tool detail: cbs.table_data
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/cbs.table_data")
check "cbs.table_data detail 200" "$([ "$HTTP" = "200" ] && echo 0 || echo 1)"

# 6. Input schema validation
HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/cbs.catalog_search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props = t.get('input_schema',{}).get('properties',{})
print('ok' if props else 'no')
")
check "cbs.catalog_search has input_schema" "$([ "$HAS_SCHEMA" = "ok" ] && echo 0 || echo 1)"

# 7. Check dashboard entry for CBS
DASH=$(curl -s "$BASE/api/v1/dashboard" | python3 -c "
import sys,json; d=json.load(sys.stdin)
match = [p for p in d['providers'] if p['provider'] == 'cbs']
print('ok' if match else 'no')
" 2>/dev/null || echo "no")
check "CBS in dashboard" "$([ "$DASH" = "ok" ] && echo 0 || echo 1)"

# 8. Live API call test (requires TEST_API_KEY)
if [ -n "${TEST_API_KEY:-}" ]; then
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$BASE/api/v1/tools/cbs.catalog_search/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"query":"population","top":5}')
  check "cbs.catalog_search live call" "$([ "$HTTP" = "200" ] && echo 0 || echo 1)"
else
  echo "SKIP: Live API call (set TEST_API_KEY to test)"
fi

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ] && echo "All CBS tests passed!" || exit 1
