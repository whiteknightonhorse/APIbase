#!/usr/bin/env bash
# Smoke tests for Data USA (UC-737)
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

echo "=== Data USA Smoke Tests ($BASE) ==="

# 1. Health check
R=$(curl -s "$BASE/health/ready")
check "health ready" "$R" '"status":"ready"'

# 2. data-usa tools in catalog (expect 3)
R=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); du=[t for t in d['data'] if t['id'].startswith('data-usa.')]; print(f'datausa_count={len(du)}')")
check "data-usa tools count=3" "$R" "datausa_count=3"

# 3. Tool detail — query (has schema)
R=$(curl -s "$BASE/api/v1/tools/data-usa.query")
check "data-usa.query detail" "$R" '"id":"data-usa.query"'
check "data-usa.query schema" "$R" '"drilldowns"'

# 4. Tool detail — cubes
R=$(curl -s "$BASE/api/v1/tools/data-usa.cubes")
check "data-usa.cubes detail" "$R" '"id":"data-usa.cubes"'
check "data-usa.cubes schema" "$R" '"topic"'

# 5. Tool detail — members
R=$(curl -s "$BASE/api/v1/tools/data-usa.members")
check "data-usa.members detail" "$R" '"id":"data-usa.members"'
check "data-usa.members schema" "$R" '"level"'

# 6. Live upstream data query (direct)
R=$(curl -s "https://api.datausa.io/tesseract/data.jsonrecords?cube=acs_yg_total_population_1&drilldowns=Nation&measures=Population")
check "upstream data query returns Nation row" "$R" '"Nation":"United States"'

# 7. Live upstream cubes list (direct)
R=$(curl -s "https://api.datausa.io/tesseract/cubes" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'cubes={len(d[\"cubes\"])}')")
check "upstream cubes list non-empty" "$R" "cubes="

# 8. Live upstream members search (direct)
R=$(curl -s "https://api.datausa.io/tesseract/members?cube=acs_yg_total_population_1&level=State&search=cali")
check "upstream members search returns California" "$R" '"California"'

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || exit 1
