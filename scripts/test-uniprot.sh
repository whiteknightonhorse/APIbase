#!/usr/bin/env bash
set -euo pipefail

BASE="https://apibase.pro"
KEY="${SMOKE_TEST_KEY:-$(grep SMOKE_TEST_KEY .env 2>/dev/null | cut -d= -f2-)}"

echo "=== UniProt (UC-553) Smoke Test ==="

# 1. Health
echo -n "1/4 Health... "
curl -sf "$BASE/health/ready" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['status']=='ready', d" && echo "PASS"

# 2. Tools in catalog
echo -n "2/4 UniProt tools in catalog... "
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
unis=[t for t in d['data'] if t['id'].startswith('uniprot.')]
print(len(unis))
")
[ "$COUNT" -eq 4 ] && echo "PASS ($COUNT tools)" || (echo "FAIL (expected 4, got $COUNT)" && exit 1)

# 3. Tool detail with schema
echo -n "3/4 Tool schema... "
curl -s "$BASE/api/v1/tools/uniprot.protein_search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
assert t.get('input_schema',{}).get('properties'), 'No schema properties'
assert t.get('description','') != t.get('name',''), 'Description missing'
print('PASS (props:', list(t['input_schema']['properties'].keys()), ')')
"

# 4. Live endpoint (payment gate = working correctly)
echo -n "4/4 Payment gate (402 expected)... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/tools/uniprot.protein_search/call" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"hemoglobin","reviewed":true,"limit":2}')
[ "$STATUS" -eq 402 ] && echo "PASS (402 payment required)" || (echo "FAIL (got $STATUS)" && exit 1)

echo ""
echo "=== UniProt test complete: 4/4 PASS ==="
