#!/bin/bash
# Smoke tests for Statistics Canada WDS (UC-539)

BASE="https://apibase.pro"
PASS=0; FAIL=0

ok() { echo "PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== StatCan WDS (UC-539) Smoke Tests ==="

# 1. Health check
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health/ready")
if [ "$HTTP" = "200" ]; then ok "Health check"; else fail "Health check: $HTTP"; fi

# 2. StatCan tools in catalog (expect exactly 5)
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
sc=[t for t in d['data'] if t['id'].startswith('statcan.')]
print(len(sc))
")
if [ "$COUNT" = "5" ]; then ok "StatCan tools in catalog (5)"; else fail "StatCan tools count: $COUNT (expected 5)"; fi

# 3. Tool detail — catalogue_search
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/statcan.catalogue_search")
if [ "$HTTP" = "200" ]; then ok "statcan.catalogue_search detail"; else fail "statcan.catalogue_search detail: $HTTP"; fi

# 4. Tool detail — table_metadata
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/statcan.table_metadata")
if [ "$HTTP" = "200" ]; then ok "statcan.table_metadata detail"; else fail "statcan.table_metadata detail: $HTTP"; fi

# 5. Tool detail — series_data
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/statcan.series_data")
if [ "$HTTP" = "200" ]; then ok "statcan.series_data detail"; else fail "statcan.series_data detail: $HTTP"; fi

# 6. Schema populated for catalogue_search
HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/statcan.catalogue_search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print('true' if props else 'false')
")
if [ "$HAS_SCHEMA" = "true" ]; then ok "catalogue_search has input_schema"; else fail "catalogue_search missing schema"; fi

# 7. Upstream API reachable
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "https://www150.statcan.gc.ca/t1/wds/rest/getSeriesInfoFromVector" \
  -X POST -H "Content-Type: application/json" -d '[{"vectorId":32164132}]')
if [ "$HTTP" = "200" ]; then ok "StatCan upstream reachable"; else fail "StatCan upstream: $HTTP"; fi

# 8. Payment gating (401 expected for invalid key)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/tools/statcan.catalogue_search/call" \
  -H "Authorization: Bearer ak_live_TESTKEY1234567890123456789012345678" \
  -H "Content-Type: application/json" -d '{"query":"labour"}')
if [ "$HTTP" = "401" ] || [ "$HTTP" = "402" ]; then ok "Auth/payment gating active"; else fail "Gating: got $HTTP (expected 401/402)"; fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" = "0" ]; then echo "ALL PASS"; else exit 1; fi
