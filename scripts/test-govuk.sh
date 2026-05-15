#!/bin/bash
# GOV.UK Content API smoke test (UC-430)
# Tests: health, catalog presence, tool schemas, upstream API
set -e

BASE="https://apibase.pro"
PROVIDER="govuk"
TOOLS=("govuk.search" "govuk.content" "govuk.organisations")

echo "=== GOV.UK Content API Smoke Test (UC-430) ==="

# 1. Health check
echo -n "1/5 Health check... "
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL (status=$STATUS)"; exit 1; }

# 2. GOV.UK tools in catalog
echo -n "2/5 GOV.UK tools in catalog... "
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('govuk.')))")
[ "$COUNT" -eq 3 ] && echo "PASS ($COUNT tools)" || { echo "FAIL (expected 3, got $COUNT)"; exit 1; }

# 3. Tool detail endpoints (200 + input_schema)
echo -n "3/5 Tool detail endpoints... "
for TOOL in "${TOOLS[@]}"; do
  RESP=$(curl -s "${BASE}/api/v1/tools/${TOOL}")
  HAS_SCHEMA=$(echo "$RESP" | python3 -c "import sys,json; t=json.load(sys.stdin); print('ok' if t.get('input_schema',{}).get('properties') else 'missing')" 2>/dev/null)
  [ "$HAS_SCHEMA" = "ok" ] || { echo "FAIL ($TOOL missing input_schema)"; exit 1; }
done
echo "PASS"

# 4. Upstream API: GOV.UK Search
echo -n "4/5 Upstream search API... "
RESULT_COUNT=$(curl -s "https://www.gov.uk/api/search.json?q=income+tax&count=3" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('results',[])))")
[ "$RESULT_COUNT" -gt 0 ] && echo "PASS ($RESULT_COUNT results)" || { echo "FAIL (no results)"; exit 1; }

# 5. Upstream API: GOV.UK Organisations
echo -n "5/5 Upstream organisations API... "
ORG_TOTAL=$(curl -s "https://www.gov.uk/api/organisations?page=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))")
[ "$ORG_TOTAL" -gt 1000 ] && echo "PASS (${ORG_TOTAL} orgs)" || { echo "FAIL (expected >1000, got $ORG_TOTAL)"; exit 1; }

echo ""
echo "=== All GOV.UK tests passed ==="
