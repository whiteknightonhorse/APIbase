#!/usr/bin/env bash
# Test script for Statistics Denmark (StatBank) adapter — UC-594
# Usage: bash scripts/test-statistics-denmark.sh
# Override target with BASE=http://127.0.0.1:8880 bash scripts/test-statistics-denmark.sh

set -e
BASE="${BASE:-https://apibase.pro}"

echo "=== Statistics Denmark (UC-594) Smoke Tests ==="
echo "Target: ${BASE}"

# 1. Health check
echo -n "1/5 Health check... "
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL (${STATUS})"; exit 1; }

# 2. statistics-denmark tools appear in catalog
echo -n "2/5 statistics-denmark tools in catalog... "
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t['id'].startswith('statistics-denmark.')))
")
[ "$COUNT" -eq 4 ] && echo "PASS (${COUNT} tools)" || { echo "FAIL (expected 4, got ${COUNT})"; exit 1; }

# 3. Tool detail endpoints return 200 with input_schema
echo -n "3/5 Tool detail endpoints... "
for tid in statistics-denmark.subjects statistics-denmark.tables statistics-denmark.table_info statistics-denmark.data; do
  RESP=$(curl -s "${BASE}/api/v1/tools/${tid}")
  HAS_SCHEMA=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(bool(d.get('input_schema',{}).get('properties')))")
  [ "$HAS_SCHEMA" = "True" ] || { echo "FAIL: ${tid} missing input_schema"; exit 1; }
done
echo "PASS (all 4 have input_schema)"

# 4. Live StatBank table search API
echo -n "4/5 Live StatBank table search (direct API)... "
COUNT=$(curl -s "https://api.statbank.dk/v1/tables?query=population&lang=en" | python3 -c "
import sys,json; d=json.load(sys.stdin); print(len(d))
")
[ "$COUNT" -gt 0 ] && echo "PASS (${COUNT} results)" || { echo "FAIL (no results)"; exit 1; }

# 5. Live StatBank population data API
echo -n "5/5 Live StatBank population data (direct API)... "
VAL=$(curl -s -X POST "https://api.statbank.dk/v1/data" \
  -H "Content-Type: application/json" \
  -d '{"table":"FOLK1A","format":"JSONSTAT","lang":"en","valuePresentation":"Code","variables":[{"code":"OMRÅDE","values":["000"]},{"code":"KØN","values":["TOT"]},{"code":"ALDER","values":["IALT"]},{"code":"CIVILSTAND","values":["TOT"]},{"code":"Tid","values":["*"]}]}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
vals = d.get('dataset',{}).get('value',[])
print(vals[-1] if vals else 0)
")
[ "$VAL" -gt 5000000 ] && echo "PASS (Denmark population=${VAL})" || { echo "FAIL (unexpected value: ${VAL})"; exit 1; }

echo ""
echo "=== All 5 Statistics Denmark tests passed ==="
