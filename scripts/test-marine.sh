#!/bin/bash
# Smoke test for Open-Meteo Marine (UC-506)
set -e

BASE="https://apibase.pro"
PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  local expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "PASS [$label]"
    PASS=$((PASS+1))
  else
    echo "FAIL [$label] — expected '$expected' in: $result"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Open-Meteo Marine Smoke Test ==="

# 1. Health check
HEALTH=$(curl -s "$BASE/health/ready")
check "health" "$HEALTH" "ready"

# 2. Marine tools in catalog
TOOLS=$(curl -s "$BASE/api/v1/tools")
check "marine.forecast in catalog" "$TOOLS" "marine.forecast"
check "marine.wave_conditions in catalog" "$TOOLS" "marine.wave_conditions"
check "marine.swell_forecast in catalog" "$TOOLS" "marine.swell_forecast"
check "marine.sea_temperature in catalog" "$TOOLS" "marine.sea_temperature"

# 3. Tool detail endpoints
for TOOL in marine.forecast marine.wave_conditions marine.swell_forecast marine.sea_temperature; do
  DETAIL=$(curl -s "$BASE/api/v1/tools/$TOOL")
  check "$TOOL detail" "$DETAIL" "\"id\":\"$TOOL\""
  check "$TOOL has_schema" "$DETAIL" '"latitude"'
done

# 4. Input schema check (should have 4 properties)
SCHEMA=$(curl -s "$BASE/api/v1/tools/marine.forecast")
check "schema has latitude" "$SCHEMA" '"latitude"'
check "schema has longitude" "$SCHEMA" '"longitude"'
check "schema has forecast_days" "$SCHEMA" '"forecast_days"'
check "schema has timezone" "$SCHEMA" '"timezone"'

# 5. Direct upstream API sanity
UPSTREAM=$(curl -s "https://marine-api.open-meteo.com/v1/marine?latitude=48.5&longitude=-14.0&hourly=wave_height&forecast_days=1&timezone=UTC")
check "upstream wave_height" "$UPSTREAM" "wave_height"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "ALL PASSED" || exit 1
