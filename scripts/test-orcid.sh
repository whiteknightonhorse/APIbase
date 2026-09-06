#!/usr/bin/env bash
# Smoke tests for ORCID (UC-740)
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

echo "=== ORCID Smoke Tests ($BASE) ==="

# 1. Health check
R=$(curl -s "$BASE/health/ready")
check "health ready" "$R" '"status":"ready"'

# 2. orcid tools in catalog (expect 3)
R=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); it=[t for t in d['data'] if t['id'].startswith('orcid.')]; print(f'orcid_count={len(it)}')")
check "orcid tools count=3" "$R" "orcid_count=3"

# 3. Tool detail — search_researcher
R=$(curl -s "$BASE/api/v1/tools/orcid.search_researcher")
check "search_researcher detail" "$R" '"id":"orcid.search_researcher"'
check "search_researcher schema" "$R" '"query"'

# 4. Tool detail — get_person
R=$(curl -s "$BASE/api/v1/tools/orcid.get_person")
check "get_person detail" "$R" '"id":"orcid.get_person"'
check "get_person schema (orcid_id param)" "$R" '"orcid_id"'

# 5. Tool detail — get_works
R=$(curl -s "$BASE/api/v1/tools/orcid.get_works")
check "get_works detail" "$R" '"id":"orcid.get_works"'

# 6. Live upstream expanded-search (direct)
R=$(curl -s "https://pub.orcid.org/v3.0/expanded-search?q=family-name:Carberry&rows=1" -H "Accept: application/json")
check "upstream expanded-search returns orcid-id" "$R" '"orcid-id"'

# 7. Live upstream person (direct)
R=$(curl -s "https://pub.orcid.org/v3.0/0000-0002-1825-0097/person" -H "Accept: application/json")
check "upstream person returns name" "$R" '"family-name"'

# 8. Live end-to-end tool calls (requires TEST_API_KEY)
if [ -n "$TEST_API_KEY" ]; then
  R=$(curl -s -X POST "$BASE/api/v1/tools/orcid.search_researcher/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"query":"family-name:Carberry","rows":3}')
  check "live search_researcher call" "$R" '"results"'

  R=$(curl -s -X POST "$BASE/api/v1/tools/orcid.get_person/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"orcid_id":"0000-0002-1825-0097"}')
  check "live get_person call" "$R" '"biography"'

  R=$(curl -s -X POST "$BASE/api/v1/tools/orcid.get_works/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"orcid_id":"0000-0002-1825-0097"}')
  check "live get_works call" "$R" '"results"'
else
  echo "SKIP: live tool calls (no TEST_API_KEY set)"
fi

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || exit 1
