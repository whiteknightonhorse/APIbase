#!/bin/bash
# Smoke test for NASA CMR adapter (UC-578)
set -e

BASE="https://apibase.pro"
API_KEY="${TEST_API_KEY:-}"

echo "=== NASA CMR Smoke Tests ==="

# 1. Health check
echo -n "1. Health check... "
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
[ "$STATUS" = "ready" ] && echo "OK" || { echo "FAIL: $STATUS"; exit 1; }

# 2. Tools in catalog
echo -n "2. nasa-cmr tools in catalog... "
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if 'nasa-cmr' in t.get('id','')]))
")
[ "$COUNT" -eq 4 ] && echo "OK ($COUNT tools)" || { echo "FAIL: expected 4, got $COUNT"; exit 1; }

# 3. Tool detail with schema
echo -n "3. search_collections detail... "
DETAIL=$(curl -s "${BASE}/api/v1/tools/nasa-cmr.search_collections" | python3 -c "
import sys,json; t=json.load(sys.stdin)
has_props = bool(t.get('input_schema',{}).get('properties'))
has_desc = t.get('description','') != t.get('name','')
print('OK' if has_props and has_desc else 'FAIL')
")
echo "$DETAIL"

# 4. Tool detail — collection_detail
echo -n "4. collection_detail schema check... "
KEYS=$(curl -s "${BASE}/api/v1/tools/nasa-cmr.collection_detail" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props = list(t.get('input_schema',{}).get('properties',{}).keys())
print(','.join(props))
")
echo "OK (params: $KEYS)"

# 5. Live search_collections call
echo -n "5. Live search_collections (keyword=climate)... "
if [ -n "$API_KEY" ]; then
  RES=$(curl -s -X POST "${BASE}/api/v1/tools/nasa-cmr.search_collections/call" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"keyword":"climate","page_size":3}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d.get('result',{})
count=r.get('count',0)
print(f'OK (count={count})') if count > 0 else print('FAIL: no results')
")
  echo "$RES"
else
  echo "SKIP (no TEST_API_KEY)"
fi

# 6. Live list_providers call
echo -n "6. Live list_providers... "
if [ -n "$API_KEY" ]; then
  RES=$(curl -s -X POST "${BASE}/api/v1/tools/nasa-cmr.list_providers/call" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"page_size":5}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d.get('result',{})
count=r.get('count',0)
print(f'OK (providers={count})') if count > 0 else print('FAIL: no providers')
")
  echo "$RES"
else
  echo "SKIP (no TEST_API_KEY)"
fi

echo "=== NASA CMR smoke tests complete ==="
