#!/usr/bin/env bash
# test-mygene.sh — MyGene.info provider smoke test (UC-479)
set -euo pipefail

BASE="https://apibase.pro"
FAIL=0

echo "=== MyGene.info Smoke Test (UC-479) ==="

# 1. Health check
echo -n "1/5 Health check... "
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
if [ "$STATUS" = "ready" ]; then echo "PASS"; else echo "FAIL ($STATUS)"; FAIL=1; fi

# 2. MyGene tools in catalog
echo -n "2/5 MyGene tools in catalog... "
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
tools = [t for t in d['data'] if t['id'].startswith('mygene.')]
print(len(tools))
" 2>/dev/null)
if [ "$COUNT" = "4" ]; then echo "PASS ($COUNT tools)"; else echo "FAIL (expected 4, got $COUNT)"; FAIL=1; fi

# 3. Tool detail endpoints
echo -n "3/5 Tool detail endpoints... "
ALL_OK=1
for TOOL in mygene.search mygene.gene_info mygene.batch_genes mygene.query_by_symbol; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/v1/tools/${TOOL}")
  if [ "$HTTP" != "200" ]; then echo "FAIL ($TOOL → $HTTP)"; ALL_OK=0; FAIL=1; fi
done
if [ "$ALL_OK" = "1" ]; then echo "PASS (all 4 tools return 200)"; fi

# 4. Schema validation (input_schema must have properties)
echo -n "4/5 Schema populated... "
SCHEMA_OK=$(curl -s "${BASE}/api/v1/tools/mygene.search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props = list(t.get('input_schema',{}).get('properties',{}).keys())
print('OK' if len(props) >= 1 else 'MISSING')
print(' '.join(props))
" 2>/dev/null | head -1)
if [ "$SCHEMA_OK" = "OK" ]; then echo "PASS"; else echo "FAIL (no input_schema properties)"; FAIL=1; fi

# 5. Live upstream test
echo -n "5/5 Live upstream API... "
RESULT=$(curl -s --max-time 20 "https://mygene.info/v3/query?q=BRCA1&species=human&size=1" | python3 -c "
import sys,json; d=json.load(sys.stdin)
hits = d.get('hits', [])
print(hits[0].get('symbol','?') if hits else 'NO_HITS')
" 2>/dev/null)
if [ "$RESULT" = "BRCA1" ]; then echo "PASS (BRCA1 found upstream)"; else echo "WARN (got $RESULT — upstream may be slow)"; fi

echo ""
if [ "$FAIL" = "0" ]; then
  echo "=== All checks passed ==="
else
  echo "=== Some checks FAILED — investigate ==="
  exit 1
fi
