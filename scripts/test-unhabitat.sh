#!/usr/bin/env bash
# Smoke test for UN-Habitat Urban Indicators Database (UC-548)

set -euo pipefail
API_URL="${API_URL:-https://apibase.pro}"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"; local expect="$3"
  if echo "$result" | grep -q "$expect"; then
    echo "PASS: $label"; PASS=$((PASS+1))
  else
    echo "FAIL: $label — expected '$expect' in: ${result:0:200}"; FAIL=$((FAIL+1))
  fi
}

echo "=== UN-Habitat (UC-548) Smoke Tests ==="

# 1. Health
check "Health" "$(curl -s $API_URL/health/ready)" '"status":"ready"'

# 2. Tools in catalog
CATALOG=$(curl -s "$API_URL/api/v1/tools")
check "transport_access in catalog" "$CATALOG" "unhabitat.transport_access"
check "land_consumption in catalog" "$CATALOG" "unhabitat.land_consumption"
check "open_spaces in catalog" "$CATALOG" "unhabitat.open_spaces"
check "city_budget in catalog" "$CATALOG" "unhabitat.city_budget"

# 3. Tool detail has schema
DETAIL=$(curl -s "$API_URL/api/v1/tools/unhabitat.transport_access")
check "transport_access detail has schema" "$DETAIL" '"country"'
check "transport_access detail has description" "$DETAIL" 'SDG 11.2.1'

# 4. Pipeline routes correctly (401 or 402 = tool found and pipeline active)
for tool in transport_access land_consumption open_spaces city_budget; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_URL/api/v1/tools/unhabitat.${tool}/call" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ak_live_test" \
    -d '{"country":"Kenya"}')
  # 401 = auth stage (invalid key rejected), 402 = payment stage; both mean tool is live
  if [[ "$CODE" == "401" || "$CODE" == "402" ]]; then
    echo "PASS: ${tool} reaches pipeline ($CODE)"; PASS=$((PASS+1))
  else
    echo "FAIL: ${tool} — expected 401 or 402, got $CODE"; FAIL=$((FAIL+1))
  fi
done

# 5. ArcGIS upstream reachable
UPSTREAM=$(curl -s "https://services6.arcgis.com/uWtJiVzcBsV6C7NV/arcgis/rest/services/11_2_1_Percentage_Access_to_Public_Transport/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=json" --max-time 10)
check "ArcGIS upstream reachable" "$UPSTREAM" '"count"'

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "ALL PASS" || exit 1
