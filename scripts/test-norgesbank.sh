#!/bin/bash
# Smoke test for Norges Bank adapter (UC-525)
set -euo pipefail

BASE="https://apibase.pro"
PROVIDER="norgesbank"
TOOLS=("norgesbank.fx.latest" "norgesbank.fx.history" "norgesbank.rates.current" "norgesbank.rates.history")

echo "=== Norges Bank (UC-525) Smoke Test ==="

echo "1. Health check..."
curl -sf "$BASE/health/ready" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['status']=='ready'"
echo "   PASS"

echo "2. Provider tools in catalog..."
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
norges=[t for t in d['data'] if t['provider']=='$PROVIDER']
print(len(norges))
")
echo "   Found: $COUNT tools"
[ "$COUNT" -eq 4 ] && echo "   PASS" || { echo "   FAIL: expected 4 tools"; exit 1; }

echo "3. Tool detail endpoints..."
for TOOL in "${TOOLS[@]}"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  if [ "$STATUS" = "200" ]; then
    echo "   $TOOL: PASS (200)"
  else
    echo "   $TOOL: FAIL (HTTP $STATUS)"
    exit 1
  fi
done

echo "4. Input schema validation..."
PROPS=$(curl -s "$BASE/api/v1/tools/norgesbank.fx.latest" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=list(t.get('input_schema',{}).get('properties',{}).keys())
print(len(props), props)
")
echo "   norgesbank.fx.latest props: $PROPS"

echo "5. Live API upstream verification..."
echo "   Checking Norges Bank SDMX endpoint..."
RATE=$(curl -s "https://data.norges-bank.no/api/data/EXR/B.USD.NOK.SP?format=sdmx-json&lastNObservations=1" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ds = d['data']['dataSets'][0]
series = list(ds['series'].values())[0]
obs = series['observations']
val = list(obs.values())[0][0]
print(f'USD/NOK={val}')
" 2>/dev/null || echo "UPSTREAM_ERROR")
echo "   $RATE"
[[ "$RATE" == UPSTREAM_ERROR* ]] && { echo "   FAIL: upstream unavailable"; exit 1; } || echo "   PASS"

echo ""
echo "=== All Norges Bank tests PASSED ==="
