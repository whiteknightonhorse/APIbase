#!/usr/bin/env bash
# Smoke tests for Open Brewery DB (UC-736)
set -euo pipefail

BASE="${BASE:-https://apibase.pro}"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"; local expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "PASS: $label"; PASS=$((PASS+1))
  else
    echo "FAIL: $label — got: ${result:0:200}"; FAIL=$((FAIL+1))
  fi
}

echo "=== Open Brewery DB Smoke Tests ($BASE) ==="

# 1. Health check
R=$(curl -s "$BASE/health/ready")
check "health ready" "$R" '"status":"ready"'

# 2. openbrewery tools in catalog (expect 3)
R=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); ob=[t for t in d['data'] if t['id'].startswith('openbrewery.')]; print(f'openbrewery_count={len(ob)}')")
check "openbrewery tools count=3" "$R" "openbrewery_count=3"

# 3. Tool detail — list (has schema)
R=$(curl -s "$BASE/api/v1/tools/openbrewery.list")
check "openbrewery.list detail" "$R" '"id":"openbrewery.list"'
check "openbrewery.list schema" "$R" '"by_state"'

# 4. Tool detail — search
R=$(curl -s "$BASE/api/v1/tools/openbrewery.search")
check "openbrewery.search detail" "$R" '"id":"openbrewery.search"'
check "openbrewery.search schema" "$R" '"query"'

# 5. Tool detail — random
R=$(curl -s "$BASE/api/v1/tools/openbrewery.random")
check "openbrewery.random detail" "$R" '"id":"openbrewery.random"'

# 6. Live upstream search (direct)
R=$(curl -s "https://api.openbrewerydb.org/v1/breweries/search?query=dog&per_page=1")
check "upstream search returns a brewery" "$R" '"brewery_type"'

# 7. Live upstream list filter (direct)
R=$(curl -s "https://api.openbrewerydb.org/v1/breweries?by_state=California&per_page=1")
check "upstream by_state=California" "$R" '"California"'

# 8. Live upstream random (direct)
R=$(curl -s "https://api.openbrewerydb.org/v1/breweries/random")
check "upstream random returns a brewery" "$R" '"id"'

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || exit 1
