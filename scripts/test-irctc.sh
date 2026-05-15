#!/usr/bin/env bash
# IRCTC Indian Railways smoke test (UC-426)
set -euo pipefail
API="https://apibase.pro"

echo "=== IRCTC Indian Railways Smoke Test (UC-426) ==="

# 1. Health check
echo -n "1/4 Health check... "
STATUS=$(curl -s "${API}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL (status=$STATUS)"; exit 1; }

# 2. IRCTC tools in catalog
echo -n "2/4 IRCTC tools in catalog... "
COUNT=$(curl -s "${API}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
irctc=[t for t in d['data'] if t['id'].startswith('irctc.')]
print(len(irctc))
")
[ "$COUNT" -eq 3 ] && echo "PASS (${COUNT} tools)" || { echo "FAIL (expected 3, got ${COUNT})"; exit 1; }

# 3. Tool detail endpoints
echo -n "3/4 Tool detail endpoints... "
for TOOL in irctc.train_search irctc.train_status irctc.station_search; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${API}/api/v1/tools/${TOOL}")
  [ "$HTTP" = "200" ] || { echo "FAIL (${TOOL} returned ${HTTP})"; exit 1; }
done
echo "PASS"

# 4. Schema validation
echo -n "4/4 Input schema present... "
PARAMS=$(curl -s "${API}/api/v1/tools/irctc.train_search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
")
[ "$PARAMS" -eq 3 ] && echo "PASS (${PARAMS} params)" || { echo "FAIL (expected 3 params, got ${PARAMS})"; exit 1; }

echo ""
echo "=== All IRCTC smoke tests passed ==="
echo ""
echo "To test live API calls, use your APIbase API key:"
echo "  curl -X POST ${API}/api/v1/tools/irctc.station_search/call \\"
echo "    -H 'Authorization: Bearer ak_live_...' \\"
echo "    -d '{\"query\": \"Mumbai\"}'"
