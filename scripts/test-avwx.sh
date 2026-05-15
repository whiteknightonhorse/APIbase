#!/usr/bin/env bash
# AVWX Aviation Weather smoke test (UC-424)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0
FAIL=0

check() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" &>/dev/null; then
    echo "PASS: $name"
    ((PASS++))
  else
    echo "FAIL: $name"
    ((FAIL++))
  fi
}

echo "=== AVWX Aviation Weather Smoke Test (UC-424) ==="

# 1. Health check
check "Health ready" "curl -sf ${BASE}/health/ready"

# 2. Tools in catalog (3 AVWX tools)
check "AVWX tools in catalog (3)" \
  "curl -s '${BASE}/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); avwx=[t for t in d['data'] if t['id'].startswith('avwx.')]; exit(0 if len(avwx)==3 else 1)\""

# 3. Tool detail endpoints return 200
check "avwx.notams detail" "curl -sf '${BASE}/api/v1/tools/avwx.notams'"
check "avwx.pireps detail" "curl -sf '${BASE}/api/v1/tools/avwx.pireps'"
check "avwx.station_summary detail" "curl -sf '${BASE}/api/v1/tools/avwx.station_summary'"

# 4. Input schema has properties
check "avwx.notams has input_schema" \
  "curl -s '${BASE}/api/v1/tools/avwx.notams' | python3 -c \"import sys,json; t=json.load(sys.stdin); exit(0 if t.get('input_schema',{}).get('properties') else 1)\""

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -eq 0 ]; then
  echo "All AVWX tests passed."
  exit 0
else
  echo "Some AVWX tests failed."
  exit 1
fi
