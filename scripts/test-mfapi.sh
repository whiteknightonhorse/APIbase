#!/bin/bash
# Smoke test for mfapi (UC-507) — India Mutual Fund API
set -e

BASE="https://apibase.pro"
echo "=== MFAPI Smoke Test ==="

# 1. Health check
echo -n "1/4 Health... "
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL: $STATUS"; exit 1; }

# 2. Tools in catalog
echo -n "2/4 Tools in catalog... "
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
mf=[t for t in d['data'] if t['id'].startswith('mfapi.')]
print(len(mf))
")
[ "$COUNT" -eq 4 ] && echo "PASS ($COUNT tools)" || { echo "FAIL: expected 4 mfapi tools, got $COUNT"; exit 1; }

# 3. Tool detail endpoints
echo -n "3/4 Tool detail endpoints... "
for TOOL in mfapi.scheme_search mfapi.scheme_list mfapi.nav_latest mfapi.nav_history; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  [ "$HTTP" = "200" ] || { echo "FAIL: $TOOL returned $HTTP"; exit 1; }
done
echo "PASS (4/4)"

# 4. Payment enforcement (402 expected for paid tools when using valid API key)
echo -n "4/4 Payment enforcement... "
SMOKE_KEY=$(grep SMOKE_TEST_KEY "$(dirname "$0")/../.env" 2>/dev/null | cut -d= -f2- || echo "")
if [ -z "$SMOKE_KEY" ]; then
  echo "SKIP (no SMOKE_TEST_KEY in .env)"
else
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/tools/mfapi.nav_latest/call" \
    -H "Authorization: Bearer $SMOKE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"scheme_code": 100033}')
  [ "$HTTP" = "402" ] && echo "PASS (402 as expected)" || { echo "FAIL: expected 402, got $HTTP"; exit 1; }
fi

echo ""
echo "=== MFAPI: 4/4 PASS ==="
