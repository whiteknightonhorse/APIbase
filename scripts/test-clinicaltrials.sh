#!/usr/bin/env bash
# Smoke test for ClinicalTrials.gov v2 adapter (UC-531)

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"; local expect="$3"
  if echo "$result" | grep -q "$expect"; then
    echo "PASS: $label"; PASS=$((PASS+1))
  else
    echo "FAIL: $label (got: ${result:0:200})"; FAIL=$((FAIL+1))
  fi
}

echo "=== ClinicalTrials.gov v2 smoke tests ==="

R=$(curl -s "$BASE/health/ready")
check "Health ready" "$R" '"ready"'

R=$(curl -s "$BASE/api/v1/tools")
check "clinicaltrials.search in catalog" "$R" '"clinicaltrials.search"'
check "clinicaltrials.study in catalog" "$R" '"clinicaltrials.study"'
check "clinicaltrials.recruiting in catalog" "$R" '"clinicaltrials.recruiting"'
check "clinicaltrials.stats in catalog" "$R" '"clinicaltrials.stats"'

R=$(curl -s "$BASE/api/v1/tools/clinicaltrials.search")
check "search has input_schema" "$R" '"condition"'
check "search has description" "$R" 'ClinicalTrials'

R=$(curl -s "https://clinicaltrials.gov/api/v2/stats/size")
check "Upstream live" "$R" '"totalStudies"'

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
