#!/bin/bash
# SA National Treasury Municipal Finance (UC-519) smoke test

set -e
BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"; local expect="$3"
  if echo "$result" | grep -q "$expect"; then
    echo "  PASS: $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $label — expected '$expect'"
    echo "  Got: $(echo "$result" | head -c 200)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== SA Municipal Finance smoke test ==="
echo ""

# 1. Health
echo "1. Health check"
check "health" "$(curl -s "$BASE/health/ready")" '"status":"ready"'

# 2. Tools in catalog
echo ""
echo "2. Tools in catalog"
CATALOG=$(curl -s "$BASE/api/v1/tools")
check "municipalities in catalog" "$CATALOG" '"id":"samuni.municipalities"'
check "audit_opinions in catalog" "$CATALOG" '"id":"samuni.audit_opinions"'
check "income_expenditure in catalog" "$CATALOG" '"id":"samuni.income_expenditure"'
check "officials in catalog" "$CATALOG" '"id":"samuni.officials"'

# 3. Tool detail endpoints
echo ""
echo "3. Tool detail endpoints"
check "municipalities schema" "$(curl -s "$BASE/api/v1/tools/samuni.municipalities")" '"province_code"'
check "audit_opinions schema" "$(curl -s "$BASE/api/v1/tools/samuni.audit_opinions")" '"demarcation_code"'
check "income_expenditure schema" "$(curl -s "$BASE/api/v1/tools/samuni.income_expenditure")" '"demarcation_code"'
check "officials schema" "$(curl -s "$BASE/api/v1/tools/samuni.officials")" '"demarcation_code"'

# 4. Upstream API direct tests
echo ""
echo "4. Upstream API reachability"
check "municipalities upstream" "$(curl -s 'https://municipaldata.treasury.gov.za/api/cubes/municipalities/facts?_limit=1')" '"total_fact_count"'
check "audit_opinions upstream" "$(curl -s 'https://municipaldata.treasury.gov.za/api/cubes/audit_opinions/facts?_limit=1')" '"total_fact_count"'
check "officials upstream" "$(curl -s 'https://municipaldata.treasury.gov.za/api/cubes/officials/facts?municipality.demarcation_code=CPT&_limit=1')" '"total_fact_count"'

# 5. Total tool count
echo ""
echo "5. Total tool count"
TOTAL=$(echo "$CATALOG" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])" 2>/dev/null || echo "0")
check "789 tools (4 samuni added)" "$TOTAL" "789"

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ] && echo "ALL PASSED" || exit 1
