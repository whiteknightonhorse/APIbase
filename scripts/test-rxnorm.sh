#!/usr/bin/env bash
# Smoke test for UC-478: RxNorm (NIH NLM)
set -e

BASE="https://apibase.pro"
PROVIDER="rxnorm"
TOOLS=("rxnorm.drug_search" "rxnorm.rxcui_properties" "rxnorm.ndc_lookup" "rxnorm.drug_class")
PASS=0; FAIL=0

check() {
  local label="$1"; local cmd="$2"; local expect="$3"
  local result
  result=$(eval "$cmd" 2>&1)
  if echo "$result" | grep -q "$expect"; then
    echo "  PASS: $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $label"
    echo "    Expected: $expect"
    echo "    Got: ${result:0:200}"
    FAIL=$((FAIL+1))
  fi
}

echo "=== RxNorm Smoke Tests (UC-478) ==="

# 1. Health check
check "Health check" \
  "curl -s ${BASE}/health/ready" \
  '"status":"ready"'

# 2. Provider tools in catalog
check "4 rxnorm tools in catalog" \
  "curl -s '${BASE}/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); n=sum(1 for t in d['data'] if t['id'].startswith('rxnorm.')); print(n)\"" \
  "^4$"

# 3. Tool detail endpoints
for TOOL in "${TOOLS[@]}"; do
  check "Tool detail: ${TOOL}" \
    "curl -s '${BASE}/api/v1/tools/${TOOL}' | python3 -c \"import sys,json; t=json.load(sys.stdin); print('ok' if t.get('id')=='${TOOL}' and t.get('input_schema',{}).get('properties') else 'fail')\"" \
    "^ok$"
done

# 4. Live API calls (via upstream, bypassing payment for test)
check "RxNorm upstream: drug search" \
  "curl -s 'https://rxnav.nlm.nih.gov/REST/drugs.json?name=aspirin' | python3 -c \"import sys,json; d=json.load(sys.stdin); groups=d.get('drugGroup',{}).get('conceptGroup',[]); total=sum(len(g.get('conceptProperties',[])) for g in groups); print('ok' if total > 0 else 'fail')\"" \
  "^ok$"

check "RxNorm upstream: rxcui properties (aspirin=1191)" \
  "curl -s 'https://rxnav.nlm.nih.gov/REST/rxcui/1191/properties.json' | python3 -c \"import sys,json; d=json.load(sys.stdin); print('ok' if d.get('properties',{}).get('name','').lower()=='aspirin' else 'fail')\"" \
  "^ok$"

check "RxNorm upstream: NDC lookup" \
  "curl -s 'https://rxnav.nlm.nih.gov/REST/ndcstatus.json?ndc=0069-3060-86' | python3 -c \"import sys,json; d=json.load(sys.stdin); print('ok' if d.get('ndcStatus',{}).get('rxcui') else 'fail')\"" \
  "^ok$"

check "RxNorm upstream: drug class (warfarin=11289)" \
  "curl -s 'https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json?rxcui=11289' | python3 -c \"import sys,json; d=json.load(sys.stdin); n=len(d.get('rxclassDrugInfoList',{}).get('rxclassDrugInfo',[])); print('ok' if n > 0 else 'fail')\"" \
  "^ok$"

echo ""
echo "=== Results ==="
echo "Passed: ${PASS}/$(( PASS + FAIL ))"
if [ $FAIL -eq 0 ]; then echo "=== All tests passed ==="; else echo "=== FAILED: ${FAIL} test(s) ==="; exit 1; fi
