#!/usr/bin/env bash
# Smoke test for EPA ECHO adapter (UC-577)
set -euo pipefail

BASE="https://apibase.pro"
PROVIDER="echo"
EXPECTED_TOOLS=4

echo "=== EPA ECHO Smoke Test ==="

# 1. Health check
echo -n "1/4 Health check... "
STATUS=$(curl -sf "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL (status=$STATUS)"; exit 1; }

# 2. Provider tools in catalog
echo -n "2/4 Tool catalog presence... "
COUNT=$(curl -sf "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
tools=[t for t in d['data'] if t['id'].startswith('${PROVIDER}.')]
print(len(tools))
")
[ "$COUNT" -eq "$EXPECTED_TOOLS" ] && echo "PASS ($COUNT tools)" || { echo "FAIL (found $COUNT, expected $EXPECTED_TOOLS)"; exit 1; }

# 3. Tool detail endpoints
echo -n "3/4 Tool detail endpoints... "
FAILURES=0
for TOOL in echo.facility_search echo.facility_detail echo.air_facilities echo.violations; do
  HTTP=$(curl -sf "${BASE}/api/v1/tools/${TOOL}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('id') == '${TOOL}' else 'fail')")
  [ "$HTTP" = "ok" ] || { echo "FAIL on ${TOOL}"; FAILURES=$((FAILURES+1)); }
done
[ "$FAILURES" -eq 0 ] && echo "PASS" || exit 1

# 4. Input schema populated
echo -n "4/4 Input schema quality... "
SCHEMA_OK=$(curl -sf "${BASE}/api/v1/tools/echo.facility_search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
has_zip='zip_code' in props
has_desc=all(v.get('description') for v in props.values())
print('ok' if has_zip and has_desc else 'fail')
")
[ "$SCHEMA_OK" = "ok" ] && echo "PASS" || { echo "FAIL (schema missing properties or descriptions)"; exit 1; }

echo ""
echo "=== All EPA ECHO tests passed ==="
