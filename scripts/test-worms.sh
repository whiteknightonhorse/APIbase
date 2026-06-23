#!/usr/bin/env bash
# Smoke tests for WoRMS (UC-502)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"; local expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "PASS: $label"; PASS=$((PASS+1))
  else
    echo "FAIL: $label — got: ${result:0:200}"; FAIL=$((FAIL+1))
  fi
}

echo "=== WoRMS Smoke Tests ==="

# 1. Health check
R=$(curl -s "$BASE/health/ready")
check "health ready" "$R" '"status":"ready"'

# 2. WoRMS tools in catalog (expect 4)
R=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); worms=[t for t in d['data'] if t['id'].startswith('worms.')]; print(f'worms_count={len(worms)}')")
check "worms tools count=4" "$R" "worms_count=4"

# 3. Tool detail — species search (has schema)
R=$(curl -s "$BASE/api/v1/tools/worms.species.search")
check "worms.species.search detail" "$R" '"id":"worms.species.search"'
check "worms.species.search schema" "$R" '"name"'

# 4. Tool detail — species details
R=$(curl -s "$BASE/api/v1/tools/worms.species.details")
check "worms.species.details detail" "$R" '"id":"worms.species.details"'

# 5. Tool detail — classification
R=$(curl -s "$BASE/api/v1/tools/worms.species.classification")
check "worms.species.classification detail" "$R" '"id":"worms.species.classification"'

# 6. Tool detail — vernaculars
R=$(curl -s "$BASE/api/v1/tools/worms.species.vernaculars")
check "worms.species.vernaculars detail" "$R" '"id":"worms.species.vernaculars"'

# 7. Live upstream API check (direct)
R=$(curl -s "https://www.marinespecies.org/rest/AphiaRecordsByName/Orcinus%20orca?like=false")
check "upstream search Orcinus orca" "$R" '"AphiaID":137102'

# 8. Live upstream classification (direct)
R=$(curl -s "https://www.marinespecies.org/rest/AphiaClassificationByAphiaID/137102")
check "upstream classification 137102" "$R" '"rank":"Species"'

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || exit 1
