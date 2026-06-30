#!/usr/bin/env bash
set -euo pipefail

BASE="https://apibase.pro"
PROVIDER="cma"
TOOL_COUNT=4

echo "=== Cleveland Museum of Art (UC-552) Smoke Test ==="

# 1. Health
echo -n "1/5 Health check... "
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL (status=$STATUS)"; exit 1; }

# 2. CMA tools in catalog
echo -n "2/5 CMA tools in catalog... "
CMA_COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['id'].startswith('cma.')]))
")
[ "$CMA_COUNT" -eq "$TOOL_COUNT" ] && echo "PASS ($CMA_COUNT tools)" || { echo "FAIL (got $CMA_COUNT, expected $TOOL_COUNT)"; exit 1; }

# 3. Tool detail with schema
echo -n "3/5 Tool detail (cma.artwork_search)... "
RESULT=$(curl -s "${BASE}/api/v1/tools/cma.artwork_search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
has_schema = bool(t.get('input_schema',{}).get('properties'))
print('ok' if has_schema else 'no_schema')
")
[ "$RESULT" = "ok" ] && echo "PASS (schema present)" || { echo "FAIL ($RESULT)"; exit 1; }

# 4. Upstream API reachable
echo -n "4/5 Upstream API (openaccess-api.clevelandart.org)... "
UPSTREAM=$(curl -s "https://openaccess-api.clevelandart.org/api/artworks/?limit=1" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('info',{}).get('total',0) > 0 else 'no_data')
" 2>/dev/null || echo "fail")
[ "$UPSTREAM" = "ok" ] && echo "PASS" || { echo "FAIL ($UPSTREAM)"; exit 1; }

# 5. All tool detail endpoints return 200
echo -n "5/5 All tool detail endpoints (200)... "
TOOLS=("cma.artwork_search" "cma.artwork_detail" "cma.creator_search" "cma.exhibition_search")
FAIL=0
for TOOL in "${TOOLS[@]}"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/v1/tools/${TOOL}")
  [ "$CODE" = "200" ] || { echo "FAIL ($TOOL → $CODE)"; FAIL=1; }
done
[ "$FAIL" -eq 0 ] && echo "PASS (all 4 tools: 200 OK)" || exit 1

echo ""
echo "=== Cleveland Museum of Art: ALL TESTS PASSED ==="
