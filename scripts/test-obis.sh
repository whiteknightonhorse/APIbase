#!/usr/bin/env bash
# Smoke test for OBIS (UC-576) — Ocean Biodiversity Information System

set -euo pipefail
BASE="https://apibase.pro"
PASS=0; FAIL=0

ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== OBIS Smoke Tests (UC-576) ==="

# 1. Health
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/health/ready")
[ "$HTTP" = "200" ] && ok "Health check" || fail "Health check ($HTTP)"

# 2. OBIS tools appear in catalog
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
c=[t for t in d['data'] if t['id'].startswith('obis.')]
print(len(c))
")
[ "$COUNT" -ge 4 ] && ok "OBIS tools in catalog ($COUNT)" || fail "OBIS tools missing ($COUNT)"

# 3. Tool detail endpoints
for TOOL in obis.occurrence_search obis.taxon_search obis.checklist obis.dataset_search; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/v1/tools/${TOOL}")
  [ "$HTTP" = "200" ] && ok "Tool detail: ${TOOL}" || fail "Tool detail: ${TOOL} ($HTTP)"
done

# 4. Schema has properties
PROPS=$(curl -s "${BASE}/api/v1/tools/obis.occurrence_search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
")
[ "$PROPS" -ge 5 ] && ok "occurrence_search schema has $PROPS properties" || fail "occurrence_search schema sparse ($PROPS)"

# 5. Upstream API reachable
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "https://api.obis.org/v3/taxon/Abra%20alba")
[ "$HTTP" = "200" ] && ok "Upstream OBIS API reachable" || fail "Upstream OBIS API ($HTTP)"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
