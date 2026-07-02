#!/bin/bash
# DBnomics smoke test (UC-572)
BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"; local expect="$3"
  if echo "$result" | grep -q "$expect"; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc (got: ${result:0:120})"; FAIL=$((FAIL+1))
  fi
}

echo "=== DBnomics smoke tests ==="

echo "1/5 Health check..."
check "health ready" "$(curl -s $BASE/health/ready)" '"status":"ready"'

echo "2/5 dbnomics tools in catalog..."
RESULT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
dbn=[t for t in d['data'] if t['id'].startswith('dbnomics.')]
print(f'found:{len(dbn)}')
")
check "4 dbnomics tools visible" "$RESULT" "found:4"

echo "3/5 Tool detail — dbnomics.providers..."
RESULT=$(curl -s "$BASE/api/v1/tools/dbnomics.providers")
check "has input_schema" "$RESULT" '"properties"'
check "has description" "$RESULT" '"description"'

echo "4/5 Tool detail — dbnomics.fetch_series..."
RESULT=$(curl -s "$BASE/api/v1/tools/dbnomics.fetch_series")
check "series_code param" "$RESULT" '"series_code"'
check "last_n_periods param" "$RESULT" '"last_n_periods"'

echo "5/5 Live API — providers endpoint..."
RESULT=$(curl -s "https://api.db.nomics.world/v22/providers?limit=3")
check "providers live" "$RESULT" '"num_found"'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
