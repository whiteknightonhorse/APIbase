#!/bin/bash
# BEA (Bureau of Economic Analysis) smoke test — UC-545
set -e
BASE="https://apibase.pro"
BEA_API="https://apps.bea.gov/api/data"
BEA_KEY="${PROVIDER_KEY_BEA:-05560643-8D30-406D-A16C-54429016CB65}"

echo "=== BEA (Bureau of Economic Analysis) Smoke Test ==="

echo ""
echo "1. Health check..."
curl -sf "$BASE/health/ready" > /dev/null && echo "   PASS: API healthy"

echo ""
echo "2. BEA tools in catalog (expect 5)..."
COUNT=$(curl -sf "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
bea=[t for t in d['data'] if t['id'].startswith('bea.')]
print(len(bea))
for t in bea: print(f'  {t[\"id\"]}')
")
echo "   Found: $COUNT"

echo ""
echo "3. Tool detail endpoints..."
for TOOL in bea.gdp bea.personal_income bea.trade_balance bea.state_gdp bea.industry_gdp; do
  STATUS=$(curl -so /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  echo "   $TOOL → $STATUS"
  [ "$STATUS" = "200" ] || { echo "FAIL: $TOOL returned $STATUS"; exit 1; }
done

echo ""
echo "4. Live BEA API: GDP growth (T10101)..."
ROWS=$(curl -sf "${BEA_API}?UserID=${BEA_KEY}&method=GetData&DataSetName=NIPA&TableName=T10101&Frequency=A&Year=2023&ResultFormat=JSON" | python3 -c "
import sys,json; d=json.load(sys.stdin); print(len(d['BEAAPI']['Results']['Data']))
")
echo "   PASS: $ROWS rows returned (expect 25)"
[ "$ROWS" -ge 20 ] || { echo "FAIL: too few rows"; exit 1; }

echo ""
echo "5. Live BEA API: State GDP (CAGDP2, all states)..."
STATES=$(curl -sf "${BEA_API}?UserID=${BEA_KEY}&method=GetData&DataSetName=Regional&TableName=CAGDP2&LineCode=1&GeoFips=STATE&Year=2022&ResultFormat=JSON" | python3 -c "
import sys,json; d=json.load(sys.stdin); print(len(d['BEAAPI']['Results']['Data']))
")
echo "   PASS: $STATES state rows returned (expect ~60)"
[ "$STATES" -ge 50 ] || { echo "FAIL: too few state rows"; exit 1; }

echo ""
echo "6. Live BEA API: GDP by Industry..."
INDUSTRIES=$(curl -sf "${BEA_API}?UserID=${BEA_KEY}&method=GetData&DataSetName=GDPbyIndustry&TableID=1&Industry=ALL&Frequency=A&Year=2022&ResultFormat=JSON" | python3 -c "
import sys,json; d=json.load(sys.stdin); r=d['BEAAPI']['Results']; print(len(r[0]['Data']) if isinstance(r, list) else 0)
")
echo "   PASS: $INDUSTRIES industry rows returned"
[ "$INDUSTRIES" -ge 50 ] || { echo "FAIL: too few industry rows"; exit 1; }

echo ""
echo "=== All BEA smoke tests PASSED ==="
