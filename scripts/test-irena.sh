#!/usr/bin/env bash
# Smoke test for IRENA IRENASTAT (UC-550)
set -euo pipefail

BASE="https://apibase.pro"
echo "=== IRENA IRENASTAT Smoke Test (UC-550) ==="

# 1. Health check
echo -n "1/4 Health check... "
curl -sf "${BASE}/health/ready" > /dev/null && echo "PASS" || { echo "FAIL"; exit 1; }

# 2. IRENA tools in catalog
echo -n "2/4 IRENA tools in catalog... "
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
irena=[t for t in d['data'] if t['id'].startswith('irena.')]
print(len(irena))
")
[ "$COUNT" -eq 4 ] && echo "PASS (${COUNT} tools)" || { echo "FAIL (expected 4, got ${COUNT})"; exit 1; }

# 3. Tool detail endpoints
echo -n "3/4 Tool detail endpoints... "
for TOOL in irena.capacity_country irena.generation_country irena.capacity_region irena.share_renewables; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/v1/tools/${TOOL}")
  [ "$STATUS" = "200" ] || { echo "FAIL (${TOOL} returned ${STATUS})"; exit 1; }
done
echo "PASS (4/4 tools return 200)"

# 4. Schema validation
echo -n "4/4 Schema has parameters... "
PROPS=$(curl -s "${BASE}/api/v1/tools/irena.capacity_country" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
")
[ "$PROPS" -ge 4 ] && echo "PASS (${PROPS} params)" || { echo "FAIL (expected ≥4 params, got ${PROPS})"; exit 1; }

echo ""
echo "=== IRENA smoke test: 4/4 PASS ==="
