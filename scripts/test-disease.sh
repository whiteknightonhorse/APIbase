#!/usr/bin/env bash
# Smoke test for disease.sh provider (UC-192)
# Tests: health, catalog presence, tool schemas, upstream reachability

set -euo pipefail
API="https://apibase.pro"
PROVIDER="disease"
TOOLS=("disease.covid_global" "disease.covid_country" "disease.covid_history" "disease.influenza")
PASS=0; FAIL=0

ok()  { echo "[PASS] $1"; PASS=$((PASS+1)); }
fail(){ echo "[FAIL] $1"; FAIL=$((FAIL+1)); }

echo "=== disease.sh smoke test (UC-192) ==="

# 1. Health check
STATUS=$(curl -s "$API/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
[ "$STATUS" = "ready" ] && ok "Health: $STATUS" || fail "Health: $STATUS"

# 2. Tools in catalog
FOUND=$(curl -s "$API/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
tools=[t['id'] for t in d['data'] if t['id'].startswith('disease')]
print(len(tools))
")
[ "$FOUND" -ge 4 ] && ok "Catalog: $FOUND disease tools" || fail "Catalog: only $FOUND disease tools (expected 4)"

# 3. Tool detail endpoints (schema populated)
for TOOL in "${TOOLS[@]}"; do
  RESP=$(curl -s "$API/api/v1/tools/$TOOL")
  HAS_SCHEMA=$(echo "$RESP" | python3 -c "import sys,json; t=json.load(sys.stdin); print('yes' if t.get('input_schema',{}).get('properties') else 'no')" 2>/dev/null)
  [ "$HAS_SCHEMA" = "yes" ] && ok "Schema: $TOOL" || fail "Schema missing: $TOOL"
done

# 4. Upstream reachability
HTTP_GLOBAL=$(curl -s -o /dev/null -w "%{http_code}" "https://disease.sh/v3/covid-19/all")
[ "$HTTP_GLOBAL" = "200" ] && ok "Upstream: covid-19/all → $HTTP_GLOBAL" || fail "Upstream: covid-19/all → $HTTP_GLOBAL"

HTTP_COUNTRY=$(curl -s -o /dev/null -w "%{http_code}" "https://disease.sh/v3/covid-19/countries/USA")
[ "$HTTP_COUNTRY" = "200" ] && ok "Upstream: covid-19/countries/USA → $HTTP_COUNTRY" || fail "Upstream: covid-19/countries/USA → $HTTP_COUNTRY"

HTTP_HIST=$(curl -s -o /dev/null -w "%{http_code}" "https://disease.sh/v3/covid-19/historical/all?lastdays=7")
[ "$HTTP_HIST" = "200" ] && ok "Upstream: covid-19/historical → $HTTP_HIST" || fail "Upstream: covid-19/historical → $HTTP_HIST"

HTTP_FLU=$(curl -s -o /dev/null -w "%{http_code}" "https://disease.sh/v3/influenza/cdc/ILINet")
[ "$HTTP_FLU" = "200" ] && ok "Upstream: influenza/cdc/ILINet → $HTTP_FLU" || fail "Upstream: influenza/cdc/ILINet → $HTTP_FLU"

echo ""
echo "=== Result: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
