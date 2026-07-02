#!/usr/bin/env bash
# Test CBS Netherlands (Statistics NL) tools — UC-582
set -euo pipefail

BASE="https://apibase.pro"
KEY="${SMOKE_TEST_KEY:-${TEST_API_KEY:-}}"

echo "=== CBS Netherlands Smoke Tests ==="

# 1. Health check
echo -n "1/4 Health... "
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL (status=$STATUS)"; exit 1; }

# 2. CBS tools in catalog
echo -n "2/4 CBS tools in catalog... "
CBS_COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['id'].startswith('cbs.')]))
")
[ "$CBS_COUNT" = "4" ] && echo "PASS ($CBS_COUNT tools)" || { echo "FAIL (expected 4, got $CBS_COUNT)"; exit 1; }

# 3. Tool detail endpoints
echo -n "3/4 Tool detail endpoints... "
for TOOL in cbs.catalog_search cbs.table_info cbs.table_properties cbs.table_data; do
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
    [ "$HTTP" = "200" ] || { echo "FAIL ($TOOL returned $HTTP)"; exit 1; }
done
echo "PASS"

# 4. Upstream CBS API connectivity
echo -n "4/4 Upstream CBS API live... "
CBS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "https://opendata.cbs.nl/ODataCatalog/Tables?\$top=1&\$format=json")
[ "$CBS_HTTP" = "200" ] && echo "PASS" || { echo "FAIL (upstream returned $CBS_HTTP)"; exit 1; }

echo ""
echo "=== All CBS Netherlands tests passed ==="
