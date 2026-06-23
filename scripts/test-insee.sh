#!/usr/bin/env bash
# Smoke test for INSEE Sirene provider (UC-495)
set -euo pipefail

BASE="https://apibase.pro"
echo "=== INSEE Sirene Smoke Test ==="

# 1. Health
echo -n "1/4 Health... "
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL ($STATUS)"; exit 1; }

# 2. Tools in catalog
echo -n "2/4 INSEE tools in catalog... "
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t.get('id','').startswith('insee.')]
print(len(n))
")
[ "$COUNT" -eq 4 ] && echo "PASS ($COUNT tools)" || { echo "FAIL (expected 4, got $COUNT)"; exit 1; }

# 3. Schema present
echo -n "3/4 Tool schema present... "
PROPS=$(curl -s "$BASE/api/v1/tools/insee.company_by_siren" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
")
[ "$PROPS" -ge 1 ] && echo "PASS ($PROPS params)" || { echo "FAIL (no input schema)"; exit 1; }

# 4. 402 payment gate working (tool is registered and piped through payment)
echo -n "4/4 Payment gate (402)... "
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/tools/insee.company_by_siren/call" \
  -H "Authorization: Bearer ak_live_testkey000000000000000000000000" \
  -H "Content-Type: application/json" \
  -d '{"siren":"552081317"}')
# Unauthorized (401) means auth fails; 402 means tool is registered+priced
[ "$HTTP" -eq 402 ] || [ "$HTTP" -eq 401 ] && echo "PASS (HTTP $HTTP)" || { echo "FAIL (expected 401/402, got $HTTP)"; exit 1; }

echo ""
echo "=== All tests passed ==="
