#!/usr/bin/env bash
# Smoke test for DPLA (UC-574)
set -euo pipefail

BASE="https://apibase.pro"
DPLA_KEY=$(grep "PROVIDER_KEY_DPLA" .env | cut -d= -f2-)

echo "=== DPLA Smoke Test ==="

# 1. Health
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "1/4 Health: PASS" || { echo "1/4 Health: FAIL ($STATUS)"; exit 1; }

# 2. DPLA tools in catalog
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t['id'].startswith('dpla.')))
")
[ "$COUNT" = "4" ] && echo "2/4 Catalog: PASS (4 dpla tools)" || { echo "2/4 Catalog: FAIL (found $COUNT)"; exit 1; }

# 3. Tool detail endpoints
for TOOL in dpla.items.search dpla.items.detail dpla.items.by_subject dpla.items.facets; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/v1/tools/${TOOL}")
    [ "$CODE" = "200" ] || { echo "3/4 Tool detail: FAIL $TOOL ($CODE)"; exit 1; }
done
echo "3/4 Tool detail: PASS (all 4 tools return 200)"

# 4. Live DPLA API call
RESULT=$(curl -s "https://api.dp.la/v2/items?api_key=${DPLA_KEY}&q=civil+war&page_size=1")
COUNT=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count', 0))")
[ "$COUNT" -gt 0 ] && echo "4/4 Live API: PASS (count=$COUNT)" || { echo "4/4 Live API: FAIL (count=$COUNT)"; exit 1; }

echo ""
echo "=== All DPLA tests passed ==="
