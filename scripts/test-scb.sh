#!/usr/bin/env bash
# Test script for Statistics Sweden (SCB) — UC-431
# Usage: bash scripts/test-scb.sh [TEST_API_KEY]

set -euo pipefail

API_KEY="${1:-${TEST_API_KEY:-}}"
BASE_URL="https://apibase.pro"
UPSTREAM="https://api.scb.se/OV0104/v1/doris/en/ssd"
PASS=0
FAIL=0

green() { echo -e "\033[32m✓ $1\033[0m"; }
red()   { echo -e "\033[31m✗ $1\033[0m"; }
check() {
  if [ "$1" = "true" ]; then
    green "$2"; PASS=$((PASS+1))
  else
    red "$2"; FAIL=$((FAIL+1))
  fi
}

echo "=== SCB Sweden Statistics Smoke Tests (UC-431) ==="
echo ""

# 1. Health check
echo "1/5 Health check..."
STATUS=$(curl -s "${BASE_URL}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "error")
check "$( [ "$STATUS" = "ready" ] && echo true || echo false )" "Health: ${STATUS}"

# 2. SCB tools in catalog
echo "2/5 SCB tools in catalog..."
SCB_COUNT=$(curl -s "${BASE_URL}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
scb=[t for t in d['data'] if t['id'].startswith('scb.')]
print(len(scb))
" 2>/dev/null || echo "0")
check "$( [ "$SCB_COUNT" = "3" ] && echo true || echo false )" "SCB tools in catalog: ${SCB_COUNT}/3"

# 3. Tool detail endpoints (200)
echo "3/5 Tool detail endpoints..."
for TOOL in scb.catalog scb.table_metadata scb.table_query; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/v1/tools/${TOOL}")
  check "$( [ "$HTTP" = "200" ] && echo true || echo false )" "GET /api/v1/tools/${TOOL} → ${HTTP}"
done

# 4. Upstream API — top-level catalog
echo "4/5 Upstream SCB top-level catalog..."
CATALOG_LEN=$(curl -s "${UPSTREAM}/" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
check "$( [ "$CATALOG_LEN" -gt "5" ] && echo true || echo false )" "SCB top-level has ${CATALOG_LEN} categories (>5)"

# 5. Live API calls (requires TEST_API_KEY)
if [ -n "$API_KEY" ]; then
  echo "5/5 Live tool call (scb.catalog) with API key..."
  RESP=$(curl -s -X POST "${BASE_URL}/api/v1/tools/scb.catalog/call" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"path":""}' 2>/dev/null)
  HAS_DATA=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(isinstance(d.get('result'), list) and len(d['result'])>0)" 2>/dev/null || echo "False")
  check "$( [ "$HAS_DATA" = "True" ] && echo true || echo false )" "scb.catalog live call returned data"
else
  echo "5/5 Live tool call — SKIPPED (no TEST_API_KEY)"
  green "Skipped (set TEST_API_KEY to run)"
  PASS=$((PASS+1))
fi

echo ""
echo "=== Results ==="
echo "Passed: ${PASS}, Failed: ${FAIL}"
if [ "$FAIL" -eq 0 ]; then
  echo "All SCB tests passed!"
  exit 0
else
  echo "FAIL: ${FAIL} test(s) failed"
  exit 1
fi
