#!/usr/bin/env bash
# FBI Crime Data Explorer (UCR) smoke test — UC-540
# Tests: health, catalog presence, tool details, live API calls
set -euo pipefail

BASE="https://apibase.pro"
PROVIDER="fbi"
TOOL_COUNT=4
GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; exit 1; }

echo "=== FBI CDE (UCR) Smoke Test ==="

# 1. Health
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && pass "Health: ready" || fail "Health check failed: $STATUS"

# 2. Tools in catalog
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['provider'] == 'fbi']))
")
[ "$COUNT" -ge "$TOOL_COUNT" ] && pass "Catalog: ${COUNT} fbi tools" || fail "Expected ${TOOL_COUNT} fbi tools, got ${COUNT}"

# 3. Tool detail endpoints
for TOOL in fbi.national_offenses fbi.state_offenses fbi.national_annual fbi.state_annual; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/v1/tools/${TOOL}")
  [ "$STATUS" = "200" ] && pass "Detail: ${TOOL}" || fail "Tool detail ${TOOL} returned HTTP ${STATUS}"
  SCHEMA=$(curl -s "${BASE}/api/v1/tools/${TOOL}" | python3 -c "import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))")
  [ "$SCHEMA" = "True" ] && pass "Schema: ${TOOL}" || fail "No input_schema properties for ${TOOL}"
done

# 4. Live API call (direct, bypasses payment for smoke test)
API_KEY="${PROVIDER_KEY_API_DATA_GOV:-bfy7qDqWehRKLv0Ya7WEr7kdtgeTuCOm5znfSvFx}"
RESP=$(curl -s "https://api.usa.gov/crime/fbi/cde/summarized/national/violent-crime?from=01-2022&to=12-2022&api_key=${API_KEY}")
KEYS=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d.keys()))" 2>/dev/null || echo "error")
[[ "$KEYS" == *"offenses"* ]] && pass "Live API: FBI CDE returns offense data" || fail "FBI CDE API failed: ${RESP:0:100}"

STATE_RESP=$(curl -s "https://api.usa.gov/crime/fbi/cde/summarized/state/TX/property-crime?from=01-2022&to=12-2022&api_key=${API_KEY}")
STATE_KEYS=$(echo "$STATE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d.keys()))" 2>/dev/null || echo "error")
[[ "$STATE_KEYS" == *"offenses"* ]] && pass "Live API: FBI CDE state (TX) endpoint works" || fail "FBI CDE state API failed"

echo ""
echo "=== FBI CDE smoke test COMPLETE ==="
