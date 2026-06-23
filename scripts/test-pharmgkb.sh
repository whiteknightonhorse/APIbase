#!/usr/bin/env bash
# UC-500: PharmGKB smoke test
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

ok()   { echo "  PASS: $1"; ((PASS=$((PASS+1)))); }
fail() { echo "  FAIL: $1"; ((FAIL=$((FAIL+1)))); }

echo "=== PharmGKB (UC-500) smoke tests ==="

# 1. Health
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && ok "Health ready" || fail "Health: $STATUS"

# 2. PharmGKB tools in catalog (expect 4)
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([t for t in d['data'] if t['id'].startswith('pharmgkb.')]))")
[ "$COUNT" -eq 4 ] && ok "PharmGKB tools in catalog: $COUNT" || fail "Expected 4 PharmGKB tools, got: $COUNT"

# 3. Tool details have input_schema
for TOOL in pharmgkb.gene_search pharmgkb.drug_search pharmgkb.variant_lookup pharmgkb.drug_labels; do
  SCHEMA=$(curl -s "${BASE}/api/v1/tools/${TOOL}" | python3 -c "import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))")
  [ "$SCHEMA" = "True" ] && ok "Schema for ${TOOL}" || fail "No schema for ${TOOL}"
done

# 4. Live API calls (requires TEST_API_KEY env var)
if [ -n "${TEST_API_KEY:-}" ]; then
  AUTH="Authorization: Bearer ${TEST_API_KEY}"

  # gene_search
  GENE=$(curl -s -X POST "${BASE}/api/v1/tools/pharmgkb.gene_search/call" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"symbol":"CYP2C9"}' | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('result',{}).get('results',[{}])[0].get('symbol','ERROR'))")
  [ "$GENE" = "CYP2C9" ] && ok "gene_search CYP2C9" || fail "gene_search: $GENE"

  # drug_search
  DRUG=$(curl -s -X POST "${BASE}/api/v1/tools/pharmgkb.drug_search/call" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"name":"warfarin"}' | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('result',{}).get('results',[{}])[0].get('name','ERROR'))")
  [ "$DRUG" = "warfarin" ] && ok "drug_search warfarin" || fail "drug_search: $DRUG"

  # variant_lookup
  VARIANT=$(curl -s -X POST "${BASE}/api/v1/tools/pharmgkb.variant_lookup/call" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"rsid":"rs1799853"}' | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('result',{}).get('results',[{}])[0].get('symbol','ERROR'))")
  [ "$VARIANT" = "rs1799853" ] && ok "variant_lookup rs1799853" || fail "variant_lookup: $VARIANT"

  # drug_labels
  LABELS=$(curl -s -X POST "${BASE}/api/v1/tools/pharmgkb.drug_labels/call" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"source":"FDA","dosing_only":false,"page":1}' | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('result',{}).get('count',0))")
  [ "$LABELS" -gt 0 ] && ok "drug_labels FDA count=$LABELS" || fail "drug_labels: count=$LABELS"
else
  echo "  SKIP: live API calls (set TEST_API_KEY to enable)"
fi

echo ""
echo "Results: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
