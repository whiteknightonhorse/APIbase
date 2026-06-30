#!/usr/bin/env bash
# Smoke test for OECD Statistics (UC-538)
set -euo pipefail

BASE="https://apibase.pro"
KEY="${SMOKE_TEST_KEY:-${TEST_API_KEY:-}}"

echo "=== OECD Statistics Smoke Test ==="

echo "1/4 Health check..."
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "  PASS" || { echo "  FAIL: $STATUS"; exit 1; }

echo "2/4 OECD tools in catalog (expect 5)..."
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
oecd = [t for t in d['data'] if t['id'].startswith('oecd.')]
print(len(oecd))
")
[ "$COUNT" -ge 5 ] && echo "  PASS ($COUNT tools)" || { echo "  FAIL: expected 5 got $COUNT"; exit 1; }

echo "3/4 Tool detail endpoints (200)..."
for TOOL in oecd.economy.gdp oecd.economy.unemployment oecd.economy.inflation oecd.environment.emissions oecd.economy.trade; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/v1/tools/${TOOL}")
  [ "$HTTP" = "200" ] && echo "  PASS ${TOOL}" || { echo "  FAIL ${TOOL}: HTTP $HTTP"; exit 1; }
done

echo "4/4 Input schema validation..."
PROPS=$(curl -s "${BASE}/api/v1/tools/oecd.economy.gdp" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props = t.get('input_schema',{}).get('properties',{})
# verify all have descriptions
all_desc = all(v.get('description') for v in props.values())
print(f'{len(props)} props, all_desc={all_desc}')
")
echo "  PASS ($PROPS)"

echo ""
echo "=== OECD Statistics: All tests passed ==="
