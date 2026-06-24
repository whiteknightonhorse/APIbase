#!/usr/bin/env bash
# Smoke test for EPA SDWIS adapter (UC-508)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local cmd="$2"; local expect="$3"
  local out; out=$(eval "$cmd" 2>&1)
  if echo "$out" | grep -q "$expect"; then
    echo "PASS  $label"; PASS=$((PASS+1))
  else
    echo "FAIL  $label — got: $out"; FAIL=$((FAIL+1))
  fi
}

echo "=== EPA SDWIS smoke tests ==="

# 1. Health
check "Health check" \
  "curl -s ${BASE}/health/ready" "ready"

# 2. Tools in catalog (all 4)
check "4 SDWIS tools in catalog" \
  "curl -s '${BASE}/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); n=len([t for t in d['data'] if t['id'].startswith('sdwis.')]); print(n)\"" \
  "4"

# 3. Tool details — schemas populated
check "water_systems schema populated" \
  "curl -s '${BASE}/api/v1/tools/sdwis.water_systems' | python3 -c \"import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))\"" \
  "True"

check "violations schema populated" \
  "curl -s '${BASE}/api/v1/tools/sdwis.violations' | python3 -c \"import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))\"" \
  "True"

check "enforcement schema populated" \
  "curl -s '${BASE}/api/v1/tools/sdwis.enforcement' | python3 -c \"import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))\"" \
  "True"

check "service_areas schema populated" \
  "curl -s '${BASE}/api/v1/tools/sdwis.service_areas' | python3 -c \"import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))\"" \
  "True"

# 4. Direct upstream verification
check "EPA EFSERVICE water systems endpoint live" \
  "curl -s 'https://data.epa.gov/efservice/WATER_SYSTEM/STATE_CODE/=/CA/rows/0:2/JSON' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(len(d) > 0)\"" \
  "True"

check "EPA EFSERVICE violations endpoint live" \
  "curl -s 'https://data.epa.gov/efservice/VIOLATION/IS_HEALTH_BASED_IND/=/Y/rows/0:2/JSON' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(len(d) > 0)\"" \
  "True"

check "EPA EFSERVICE enforcement endpoint live" \
  "curl -s 'https://data.epa.gov/efservice/ENFORCEMENT_ACTION/rows/0:2/JSON' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(len(d) > 0)\"" \
  "True"

check "EPA EFSERVICE service areas endpoint live" \
  "curl -s 'https://data.epa.gov/efservice/GEOGRAPHIC_AREA/PRIMACY_AGENCY_CODE/=/TX/rows/0:2/JSON' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(len(d) > 0)\"" \
  "True"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
