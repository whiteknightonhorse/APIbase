#!/usr/bin/env bash
# Smoke test for CERN Open Data adapter (UC-475)
set -euo pipefail

BASE="https://apibase.pro"

echo "=== CERN Open Data Smoke Tests (UC-475) ==="

# 1. Health check
echo -n "1/4 Health check... "
STATUS=$(curl -sf "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL: $STATUS"; exit 1; }

# 2. Tools in catalog
echo -n "2/4 CERN tools in catalog... "
COUNT=$(curl -sf "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
cern=[t for t in d['data'] if 'cernopendata' in t['id']]
print(len(cern))
")
[ "$COUNT" = "4" ] && echo "PASS (4 tools)" || { echo "FAIL: found $COUNT tools"; exit 1; }

# 3. Tool detail with schema
echo -n "3/4 Tool detail + schema check... "
SCHEMA_OK=$(curl -sf "${BASE}/api/v1/tools/cernopendata.search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props = t.get('input_schema',{}).get('properties',{})
print('ok' if len(props) > 0 else 'fail')
")
[ "$SCHEMA_OK" = "ok" ] && echo "PASS" || { echo "FAIL: schema empty"; exit 1; }

# 4. Live API test (upstream CERN Open Data)
echo -n "4/4 Upstream CERN API live call... "
TOTAL=$(curl -sf "https://opendata.cern.ch/api/records/?q=higgs&size=1&page=1" \
  -H "Accept: application/json" \
  -H "User-Agent: APIbase.pro/1.0 (smoke-test)" | python3 -c "
import sys,json; d=json.load(sys.stdin); print(d['hits']['total'])
")
[ "$TOTAL" -gt 100 ] && echo "PASS (total=$TOTAL records for 'higgs')" || { echo "FAIL: too few results ($TOTAL)"; exit 1; }

echo ""
echo "=== All CERN Open Data tests passed ==="
