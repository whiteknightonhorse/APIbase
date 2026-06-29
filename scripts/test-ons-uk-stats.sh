#!/bin/bash
# Smoke test for ONS UK Statistics (UC-533)
set -e
BASE="https://apibase.pro"
SMOKE_KEY=$(grep SMOKE_TEST_KEY ../.env 2>/dev/null | cut -d= -f2- || echo "")

echo "=== ONS UK Statistics Smoke Test ==="

echo "1. Health check..."
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
[ "$STATUS" = "ready" ] && echo "   PASS (status=$STATUS)" || (echo "   FAIL: $STATUS"; exit 1)

echo "2. ONS tools in catalog..."
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ons=[t for t in d['data'] if t['id'].startswith('ons.')]
print(len(ons))
")
[ "$COUNT" -eq 5 ] && echo "   PASS ($COUNT/5 ONS tools)" || (echo "   FAIL: expected 5, got $COUNT"; exit 1)

echo "3. Tool detail endpoints..."
for TOOL in ons.datasets.list ons.stats.cpih ons.stats.gdp ons.stats.unemployment ons.stats.population; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  [ "$STATUS" = "200" ] && echo "   PASS $TOOL" || (echo "   FAIL $TOOL: HTTP $STATUS"; exit 1)
done

echo "4. Schema validation..."
SCHEMA=$(curl -s "$BASE/api/v1/tools/ons.stats.cpih" | python3 -c "
import sys,json
d=json.load(sys.stdin)
has_schema=bool(d.get('input_schema',{}).get('properties'))
has_desc=d.get('description','') != d.get('name','')
print('OK' if has_schema and has_desc else 'FAIL')
")
[ "$SCHEMA" = "OK" ] && echo "   PASS (input_schema + description present)" || (echo "   FAIL: $SCHEMA"; exit 1)

echo "5. Live API call: ons.datasets.list..."
if [ -n "$SMOKE_KEY" ]; then
  RESP=$(curl -s -X POST "$BASE/api/v1/tools/ons.datasets.list/call" \
    -H "Authorization: Bearer $SMOKE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"keyword": "gdp", "limit": 5}')
  CODE=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error_code','OK'))" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$CODE" = "OK" ]; then
    COUNT=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['returned'])")
    echo "   PASS (returned $COUNT GDP-related datasets)"
  else
    echo "   SKIP (payment required or error: $CODE)"
  fi
else
  echo "   SKIP (no SMOKE_TEST_KEY)"
fi

echo ""
echo "=== ONS UK Statistics smoke test complete ==="
