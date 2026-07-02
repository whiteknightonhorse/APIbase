#!/bin/bash
# Smoke test for Statistics Finland PxWeb (UC-571)
set -e

BASE="https://apibase.pro"

echo "=== Statistics Finland (StatFin) Smoke Test ==="

# 1. Health check
echo -n "1. Health check... "
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL (status=$STATUS)"; exit 1; }

# 2. Tools in catalog
echo -n "2. statfin tools in catalog... "
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t['id'].startswith('statfin.')))
" 2>/dev/null)
[ "$COUNT" = "4" ] && echo "PASS (${COUNT} tools)" || { echo "FAIL (expected 4, got $COUNT)"; exit 1; }

# 3. Tool detail endpoints
for TOOL in statfin.consumer_price_index statfin.population statfin.unemployment statfin.table_search; do
  echo -n "3. Tool detail ${TOOL}... "
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/v1/tools/${TOOL}")
  [ "$HTTP" = "200" ] && echo "PASS" || { echo "FAIL (HTTP ${HTTP})"; exit 1; }
done

# 4. Schema populated
echo -n "4. input_schema has properties... "
PROPS=$(curl -s "${BASE}/api/v1/tools/statfin.consumer_price_index" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
" 2>/dev/null)
[ "$PROPS" -ge "1" ] && echo "PASS (${PROPS} props)" || { echo "FAIL (0 props)"; exit 1; }

# 5. Upstream API reachable
echo -n "5. Upstream PxWeb API reachable... "
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin")
[ "$HTTP" = "200" ] && echo "PASS" || { echo "FAIL (HTTP ${HTTP})"; exit 1; }

# 6. Upstream CPI data
echo -n "6. Upstream CPI query returns data... "
VAL=$(curl -s -X POST "https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin/khi/11xs.px" \
  -H "Content-Type: application/json" \
  -d '{"query":[{"code":"contentscode","selection":{"filter":"item","values":["ip_0_2015"]}},{"code":"timeperiod_m","selection":{"filter":"top","values":["1"]}}],"response":{"format":"json-stat2"}}' | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('value',[])))") 2>/dev/null
[ "$VAL" -ge "1" ] && echo "PASS (${VAL} value(s))" || { echo "FAIL (no values)"; exit 1; }

echo ""
echo "=== All smoke tests PASS ==="
