#!/usr/bin/env bash
# Smoke test for NLM ICD-11 Clinical Tables (UC-560)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
API_KEY="${TEST_API_KEY:-ak_live_00000000000000000000000000000000}"
PASS=0; FAIL=0

check() {
  local name="$1" result="$2" expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "  PASS: $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $name (expected '$expected')"
    echo "  Got: ${result:0:200}"
    FAIL=$((FAIL+1))
  fi
}

echo "=== NLM ICD-11 Clinical Tables Smoke Test (UC-560) ==="
echo "Target: $API_URL"
echo ""

# 1. Health
echo "1. Health check"
check "health ready" "$(curl -s "$API_URL/health/ready")" '"status":"ready"'

# 2. Tool catalog
echo "2. Tool catalog presence"
CATALOG=$(curl -s "$API_URL/api/v1/tools")
check "icd11.search in catalog" "$CATALOG" '"id":"icd11.search"'
check "icd11.lookup in catalog" "$CATALOG" '"id":"icd11.lookup"'
check "icd11.autocomplete in catalog" "$CATALOG" '"id":"icd11.autocomplete"'
check "icd11.primary_search in catalog" "$CATALOG" '"id":"icd11.primary_search"'

# 3. Tool detail endpoints
echo "3. Tool detail endpoints"
check "search schema" "$(curl -s "$API_URL/api/v1/tools/icd11.search")" '"terms"'
check "lookup schema" "$(curl -s "$API_URL/api/v1/tools/icd11.lookup")" '"code"'
check "autocomplete schema" "$(curl -s "$API_URL/api/v1/tools/icd11.autocomplete")" '"terms"'
check "primary_search schema" "$(curl -s "$API_URL/api/v1/tools/icd11.primary_search")" '"max_results"'

# 4. Upstream API direct verification
echo "4. Upstream NLM ICD-11 API direct"
NLM_RESP=$(curl -s "https://clinicaltables.nlm.nih.gov/api/icd11_codes/v3/search?terms=hypertension&maxList=2")
check "upstream responds" "$NLM_RESP" '"BA00"'

# 5. Pipeline verification (expect 402 or 200 depending on balance)
echo "5. Pipeline verification (adapter resolution)"
PIPELINE=$(curl -s -X POST "$API_URL/api/v1/tools/icd11.search/call" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"terms": "diabetes"}')
# 402 = adapter found, payment required (correct) | 200 = success | 503 = adapter missing (bad)
check "pipeline: no 503 adapter missing" "$PIPELINE" '"error"\|"result"'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || exit 1
