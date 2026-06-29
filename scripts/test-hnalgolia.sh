#!/usr/bin/env bash
# Smoke test for HackerNews Algolia adapter (UC-522)
set -euo pipefail

BASE="https://apibase.pro"
PROVIDER="hnalgolia"
EXPECTED_TOOLS=5

echo "=== HackerNews Algolia Smoke Test ==="

# 1. Health
echo -n "1/5 Health check... "
STATUS=$(curl -sf "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL ($STATUS)"; exit 1; }

# 2. Provider tools in catalog
echo -n "2/5 Provider tools in catalog... "
COUNT=$(curl -sf "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t.get('provider')=='$PROVIDER']
print(len(n))
")
[ "$COUNT" -eq "$EXPECTED_TOOLS" ] && echo "PASS ($COUNT tools)" || { echo "FAIL (expected $EXPECTED_TOOLS, got $COUNT)"; exit 1; }

# 3. Tool detail endpoints
echo -n "3/5 Tool detail endpoints... "
for TOOL in hnalgolia.search hnalgolia.search_recent hnalgolia.search_comments hnalgolia.item_details hnalgolia.user_profile; do
  HTTP=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  [ "$HTTP" = "200" ] || { echo "FAIL ($TOOL returned $HTTP)"; exit 1; }
done
echo "PASS (5/5 tools 200 OK)"

# 4. Schema populated
echo -n "4/5 Input schema populated... "
PROPS=$(curl -sf "$BASE/api/v1/tools/hnalgolia.search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
")
[ "$PROPS" -ge "2" ] && echo "PASS ($PROPS properties)" || { echo "FAIL (expected >= 2 props, got $PROPS)"; exit 1; }

# 5. Algolia API live
echo -n "5/5 Algolia API live... "
HITS=$(curl -sf "https://hn.algolia.com/api/v1/search?query=rust&hitsPerPage=1&tags=story" | python3 -c "
import sys,json; d=json.load(sys.stdin); print(d.get('nbHits',0))
")
[ "$HITS" -gt 0 ] && echo "PASS ($HITS total hits for 'rust')" || { echo "FAIL (no hits)"; exit 1; }

echo ""
echo "=== All 5/5 tests passed for HackerNews Algolia ==="
