#!/usr/bin/env bash
# Test script for Statistics Norway (SSB) adapter — UC-459
# Usage: bash scripts/test-ssbnorway.sh

set -e
BASE="https://apibase.pro"

echo "=== SSB Norway (UC-459) Smoke Tests ==="

# 1. Health check
echo -n "1/5 Health check... "
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL (${STATUS})"; exit 1; }

# 2. SSB tools appear in catalog
echo -n "2/5 SSB tools in catalog... "
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t['id'].startswith('ssbnorway.')))
")
[ "$COUNT" -eq 4 ] && echo "PASS (${COUNT} tools)" || { echo "FAIL (expected 4, got ${COUNT})"; exit 1; }

# 3. Tool detail endpoints return 200 with input_schema
echo -n "3/5 Tool detail endpoints... "
for tid in ssbnorway.search ssbnorway.metadata ssbnorway.query ssbnorway.population; do
  RESP=$(curl -s "${BASE}/api/v1/tools/${tid}")
  HAS_SCHEMA=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(bool(d.get('input_schema',{}).get('properties')))")
  [ "$HAS_SCHEMA" = "True" ] || { echo "FAIL: ${tid} missing input_schema"; exit 1; }
done
echo "PASS (all 4 have input_schema)"

# 4. Live SSB search API
echo -n "4/5 Live SSB search (direct API)... "
COUNT=$(curl -s "https://data.ssb.no/api/v0/en/table/?query=population&limit=5" | python3 -c "
import sys,json; d=json.load(sys.stdin); print(len(d))
")
[ "$COUNT" -gt 0 ] && echo "PASS (${COUNT} results)" || { echo "FAIL (no results)"; exit 1; }

# 5. Live SSB population data API
echo -n "5/5 Live SSB population data (direct API)... "
VALS=$(curl -s -X POST "https://data.ssb.no/api/v0/en/table/07459" \
  -H "Content-Type: application/json" \
  -d '{"query":[{"code":"Region","selection":{"filter":"item","values":["0"]}},{"code":"ContentsCode","selection":{"filter":"item","values":["Personer1"]}},{"code":"Tid","selection":{"filter":"top","values":["1"]}}],"response":{"format":"json-stat2"}}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
vals = d.get('value',[])
print(vals[0] if vals else 0)
")
[ "$VALS" -gt 5000000 ] && echo "PASS (Norway population=${VALS})" || { echo "FAIL (unexpected value: ${VALS})"; exit 1; }

echo ""
echo "=== All 5 SSB Norway tests passed ==="
