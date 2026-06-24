#!/usr/bin/env bash
# Smoke test for Open Topo Data (UC-514)
# Usage: bash scripts/test-opentopodata.sh [API_KEY]

set -euo pipefail

BASE="https://apibase.pro"
API_KEY="${1:-${TEST_API_KEY:-}}"
PASS=0; FAIL=0

check() {
  local label="$1" result="$2" expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "  PASS: $label"
    ((PASS++)) || true
  else
    echo "  FAIL: $label — expected '$expected' in: $result"
    ((FAIL++)) || true
  fi
}

echo "=== Open Topo Data smoke tests ==="

# 1. Health
check "health" "$(curl -s "$BASE/health/ready")" "ready"

# 2. Tools in catalog
check "tools in catalog" "$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ids=[t['id'] for t in d['data'] if t['id'].startswith('opentopodata')]
print(f'{len(ids)} opentopodata tools: {ids}')
")" "4 opentopodata tools"

# 3. Tool detail — schema populated
check "point tool detail" "$(curl -s "$BASE/api/v1/tools/opentopodata.point" | python3 -c "
import sys,json; t=json.load(sys.stdin); print(list(t['input_schema']['properties'].keys()))
")" "lat"

check "batch tool detail" "$(curl -s "$BASE/api/v1/tools/opentopodata.batch" | python3 -c "
import sys,json; t=json.load(sys.stdin); print(list(t['input_schema']['properties'].keys()))
")" "locations"

check "high_res tool detail" "$(curl -s "$BASE/api/v1/tools/opentopodata.high_res" | python3 -c "
import sys,json; t=json.load(sys.stdin); print(list(t['input_schema']['properties'].keys()))
")" "dataset"

check "ocean tool detail" "$(curl -s "$BASE/api/v1/tools/opentopodata.ocean" | python3 -c "
import sys,json; t=json.load(sys.stdin); print(list(t['input_schema']['properties'].keys()))
")" "interpolation"

# 4. Live API calls (require API key)
if [ -n "$API_KEY" ]; then
  call() { curl -s -X POST "$BASE/api/v1/tools/$1/call" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "$2"; }

  check "point — Everest ASTER" \
    "$(call opentopodata.point '{"lat":27.9881,"lon":86.9250,"dataset":"aster30m"}')" \
    "elevation_m"

  check "batch — 3 cities" \
    "$(call opentopodata.batch '{"locations":[{"lat":40.7128,"lon":-74.006},{"lat":51.5074,"lon":-0.1278},{"lat":48.8566,"lon":2.3522}]}')" \
    "count"

  check "high_res — NYC NED" \
    "$(call opentopodata.high_res '{"lat":40.714728,"lon":-74.006015,"dataset":"ned10m"}')" \
    "elevation_m"

  check "ocean — Pacific bathymetry" \
    "$(call opentopodata.ocean '{"lat":0,"lon":-150}')" \
    "elevation_m"
else
  echo "  SKIP: live API calls (set TEST_API_KEY or pass as arg)"
fi

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ]
