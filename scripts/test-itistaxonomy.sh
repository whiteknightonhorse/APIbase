#!/usr/bin/env bash
# Smoke tests for ITIS Taxonomy (UC-739)
set -euo pipefail

BASE="${BASE:-https://apibase.pro}"
TEST_API_KEY="${TEST_API_KEY:-}"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"; local expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "PASS: $label"; PASS=$((PASS+1))
  else
    echo "FAIL: $label — got: ${result:0:200}"; FAIL=$((FAIL+1))
  fi
}

echo "=== ITIS Taxonomy Smoke Tests ($BASE) ==="

# 1. Health check
R=$(curl -s "$BASE/health/ready")
check "health ready" "$R" '"status":"ready"'

# 2. itistaxonomy tools in catalog (expect 3)
R=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); it=[t for t in d['data'] if t['id'].startswith('itistaxonomy.')]; print(f'itistaxonomy_count={len(it)}')")
check "itistaxonomy tools count=3" "$R" "itistaxonomy_count=3"

# 3. Tool detail — search_scientific_name
R=$(curl -s "$BASE/api/v1/tools/itistaxonomy.search_scientific_name")
check "search_scientific_name detail" "$R" '"id":"itistaxonomy.search_scientific_name"'
check "search_scientific_name schema" "$R" '"query"'

# 4. Tool detail — search_common_name
R=$(curl -s "$BASE/api/v1/tools/itistaxonomy.search_common_name")
check "search_common_name detail" "$R" '"id":"itistaxonomy.search_common_name"'

# 5. Tool detail — get_full_record
R=$(curl -s "$BASE/api/v1/tools/itistaxonomy.get_full_record")
check "get_full_record detail" "$R" '"id":"itistaxonomy.get_full_record"'
check "get_full_record schema (tsn param)" "$R" '"tsn"'

# 6. Live upstream searchByScientificName (direct)
R=$(curl -s "https://www.itis.gov/ITISWebService/jsonservice/searchByScientificName?srchKey=Bison%20bison")
check "upstream scientific name search returns a tsn" "$R" '"tsn"'

# 7. Live upstream getFullRecordFromTSN (direct)
R=$(curl -s "https://www.itis.gov/ITISWebService/jsonservice/getFullRecordFromTSN?tsn=180543")
check "upstream full record returns scientificName" "$R" '"scientificName"'

# 8. Live end-to-end tool calls (requires TEST_API_KEY)
if [ -n "$TEST_API_KEY" ]; then
  R=$(curl -s -X POST "$BASE/api/v1/tools/itistaxonomy.search_scientific_name/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"query":"Puma concolor"}')
  check "live search_scientific_name call" "$R" '"results"'

  R=$(curl -s -X POST "$BASE/api/v1/tools/itistaxonomy.get_full_record/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"tsn":"180543"}')
  check "live get_full_record call" "$R" '"scientific_name"'
else
  echo "SKIP: live tool calls (no TEST_API_KEY set)"
fi

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || exit 1
