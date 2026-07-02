#!/bin/bash
# Smoke test for MedlinePlus Connect (UC-580)
set -e

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"
  if [ "$result" = "OK" ]; then
    echo "PASS: $desc"; PASS=$((PASS+1))
  else
    echo "FAIL: $desc — $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== MedlinePlus Connect smoke tests ==="

# 1. Health check
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
check "Health check" "$([ "$STATUS" = "ready" ] && echo OK || echo "status=$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
mp=[t for t in d['data'] if 'medlineplus' in t['id']]
print(len(mp))
")
check "4 medlineplus tools in catalog" "$([ "$COUNT" = "4" ] && echo OK || echo "found=$COUNT")"

# 3. Tool details (input_schema present)
for TOOL in medlineplus.icd10_lookup medlineplus.icd9_lookup medlineplus.snomed_lookup medlineplus.rxnorm_lookup; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('OK' if t.get('input_schema',{}).get('properties') else 'MISSING')
")
  check "Tool detail schema: $TOOL" "$HAS_SCHEMA"
done

# 4. Live API call (direct upstream — no auth needed)
LIVE=$(curl -s "https://connect.medlineplus.gov/service?mainSearchCriteria.v.c=E11&mainSearchCriteria.v.cs=2.16.840.1.113883.6.90&knowledgeResponseType=application/json" | python3 -c "
import sys,json; d=json.load(sys.stdin)
entries = d['feed'].get('entry', [])
print(f'OK ({len(entries)} results)' if entries else 'EMPTY')
" 2>&1)
check "Live ICD-10 E11 lookup (upstream)" "$(echo $LIVE | grep -q OK && echo OK || echo "$LIVE")"

RXNORM=$(curl -s "https://connect.medlineplus.gov/service?mainSearchCriteria.v.c=161&mainSearchCriteria.v.cs=2.16.840.1.113883.6.88&knowledgeResponseType=application/json" | python3 -c "
import sys,json; d=json.load(sys.stdin)
entries = d['feed'].get('entry', [])
print(f'OK ({len(entries)} results)' if entries else 'EMPTY')
" 2>&1)
check "Live RxNorm RXCUI 161 lookup (upstream)" "$(echo $RXNORM | grep -q OK && echo OK || echo "$RXNORM")"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "ALL PASS" || exit 1
