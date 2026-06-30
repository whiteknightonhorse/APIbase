#!/usr/bin/env bash
# Smoke test for WHO Global Health Observatory OData (UC-558)
set -euo pipefail

BASE="https://apibase.pro"
API_KEY="${SMOKE_TEST_KEY:-$(grep SMOKE_TEST_KEY /home/apibase/apibase/.env | cut -d= -f2-)}"
PASS=0; FAIL=0

check() {
  local label="$1"; local cmd="$2"; local expected="$3"
  result=$(eval "$cmd" 2>&1)
  if echo "$result" | grep -q "$expected"; then
    echo "PASS: $label"; PASS=$((PASS + 1))
  else
    echo "FAIL: $label — got: ${result:0:200}"; FAIL=$((FAIL + 1))
  fi
}

echo "=== WHO GHO OData Smoke Tests ==="

# 1. Health
check "Health ready" \
  "curl -s $BASE/health/ready" \
  '"status":"ready"'

# 2. Provider tools in catalog
check "WHO-GHO tools in catalog (4)" \
  "curl -s '$BASE/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); n=sum(1 for t in d['data'] if t.get('provider')=='who-gho'); print(f'who-gho_tools:{n}')\"" \
  "who-gho_tools:4"

# 3. Tool detail - indicator_search
check "Tool detail who.indicator_search has schema" \
  "curl -s '$BASE/api/v1/tools/who.indicator_search'" \
  '"keyword"'

# 4. Tool detail - indicator_data
check "Tool detail who.indicator_data has schema" \
  "curl -s '$BASE/api/v1/tools/who.indicator_data'" \
  '"indicator_code"'

# 5. Tool detail - country_health
check "Tool detail who.country_health has schema" \
  "curl -s '$BASE/api/v1/tools/who.country_health'" \
  '"country_code"'

# 6. Tool detail - dimension_values
check "Tool detail who.dimension_values has schema" \
  "curl -s '$BASE/api/v1/tools/who.dimension_values'" \
  '"dimension"'

# 7. Live indicator_search returns 402 (payment required = tool is live)
check "who.indicator_search returns 402 payment required" \
  "curl -s -X POST '$BASE/api/v1/tools/who.indicator_search/call' -H 'Authorization: Bearer $API_KEY' -H 'Content-Type: application/json' -d '{\"keyword\":\"immunization\",\"limit\":3}'" \
  "payment_required"

# 8. Dashboard entry
check "WHO GHO in dashboard" \
  "curl -s '$BASE/api/v1/dashboard' | python3 -c \"import sys,json; d=json.load(sys.stdin); p=[x for x in d['providers'] if x['provider']=='who-gho']; print(f'found:{len(p)}')\"" \
  "found:1"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
