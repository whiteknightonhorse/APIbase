#!/usr/bin/env bash
# Smoke test for OpenFDA Medical Devices (UC-505)
set -e

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local cmd="$2"; local expect="$3"
  result=$(eval "$cmd" 2>&1)
  if echo "$result" | grep -q "$expect"; then
    echo "  PASS: $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $label (got: ${result:0:120})"
    FAIL=$((FAIL+1))
  fi
}

echo "=== OpenFDA Medical Devices (UC-505) Smoke Test ==="

# 1. Health
check "Health ready" "curl -s $BASE/health/ready" '"status":"ready"'

# 2. Tool count (should be 733+)
check "Tool catalog ≥733 tools" \
  "curl -s '$BASE/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d['total'])\"" \
  "^7[3-9][0-9]$\|^[89][0-9][0-9]$"

# 3. All 4 tools in catalog
for tool in "openfda_devices.recalls" "openfda_devices.clearances_510k" "openfda_devices.adverse_events" "openfda_devices.classification"; do
  check "Tool $tool in catalog" \
    "curl -s '$BASE/api/v1/tools' | python3 -m json.tool" \
    "\"$tool\""
done

# 4. Tool detail endpoints return schemas
check "recalls has input_schema" \
  "curl -s '$BASE/api/v1/tools/openfda_devices.recalls'" \
  '"properties"'
check "clearances_510k has input_schema" \
  "curl -s '$BASE/api/v1/tools/openfda_devices.clearances_510k'" \
  '"properties"'
check "adverse_events has input_schema" \
  "curl -s '$BASE/api/v1/tools/openfda_devices.adverse_events'" \
  '"properties"'
check "classification has input_schema" \
  "curl -s '$BASE/api/v1/tools/openfda_devices.classification'" \
  '"properties"'

# 5. Upstream API reachability
check "OpenFDA device/recall.json reachable" \
  "curl -s 'https://api.fda.gov/device/recall.json?limit=1'" \
  '"total"'
check "OpenFDA device/510k.json reachable" \
  "curl -s 'https://api.fda.gov/device/510k.json?limit=1'" \
  '"total"'
check "OpenFDA device/event.json reachable" \
  "curl -s 'https://api.fda.gov/device/event.json?limit=1'" \
  '"total"'
check "OpenFDA device/classification.json reachable" \
  "curl -s 'https://api.fda.gov/device/classification.json?limit=1'" \
  '"total"'

# 6. Dashboard entry
sudo docker exec apibase-redis-1 redis-cli DEL 'dashboard:data' >/dev/null 2>&1 || true
check "Dashboard shows openfda_devices" \
  "curl -s '$BASE/api/v1/dashboard' | python3 -m json.tool" \
  '"openfda_devices"'

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || exit 1
