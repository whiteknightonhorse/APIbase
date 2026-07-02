#!/usr/bin/env bash
# Smoke test for UK Legislation (UC-589)
set -euo pipefail

BASE="https://apibase.pro"
PROVIDER="ukleg"
TOOLS=("ukleg.legislation.search" "ukleg.legislation.details" "ukleg.legislation.recent" "ukleg.legislation.sections")
PASS=0
FAIL=0

check() {
  local desc="$1"
  local condition="$2"
  if [ "$condition" = "true" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== UK Legislation (UC-589) Smoke Tests ==="
echo ""

# 1. Health
echo "1. Health check"
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo true || echo false)"

# 2. Tools in catalog
echo "2. Tools in catalog"
CATALOG=$(curl -s "$BASE/api/v1/tools")
for tool in "${TOOLS[@]}"; do
  FOUND=$(echo "$CATALOG" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if any(t['id']=='$tool' for t in d['data']) else 'false')" 2>/dev/null)
  check "Tool $tool in catalog" "$FOUND"
done

# 3. Tool detail endpoints
echo "3. Tool detail endpoints"
for tool in "${TOOLS[@]}"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$tool")
  check "GET /api/v1/tools/$tool returns 200" "$([ "$STATUS" = "200" ] && echo true || echo false)"
done

# 4. Schema has properties
echo "4. Schema validation"
SCHEMA=$(curl -s "$BASE/api/v1/tools/ukleg.legislation.search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('true' if bool(t.get('input_schema',{}).get('properties')) else 'false')
" 2>/dev/null)
check "ukleg.legislation.search has input_schema properties" "$SCHEMA"

# 5. Live API calls (requires TEST_API_KEY)
if [ -n "${TEST_API_KEY:-}" ]; then
  echo "5. Live API calls"
  SEARCH_RESP=$(curl -s -X POST "$BASE/api/v1/tools/ukleg.legislation.search/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"title": "data protection", "type": "ukpga"}')
  HAS_RESULT=$(echo "$SEARCH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if 'result' in d and d['result'].get('total_results',0)>0 else 'false')" 2>/dev/null)
  check "Search returns results" "$HAS_RESULT"

  DETAILS_RESP=$(curl -s -X POST "$BASE/api/v1/tools/ukleg.legislation.details/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "ukpga", "year": 2008, "number": 27}')
  HAS_TITLE=$(echo "$DETAILS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if 'result' in d and 'Climate' in d['result'].get('title','') else 'false')" 2>/dev/null)
  check "Details returns Climate Change Act 2008" "$HAS_TITLE"

  RECENT_RESP=$(curl -s -X POST "$BASE/api/v1/tools/ukleg.legislation.recent/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "primary", "limit": 5}')
  HAS_RECENT=$(echo "$RECENT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if 'result' in d and len(d['result'].get('legislation',[]))>0 else 'false')" 2>/dev/null)
  check "Recent returns legislation" "$HAS_RECENT"

  SECTIONS_RESP=$(curl -s -X POST "$BASE/api/v1/tools/ukleg.legislation.sections/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "ukpga", "year": 2008, "number": 27}')
  HAS_SECTIONS=$(echo "$SECTIONS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if 'result' in d and d['result'].get('section_count',0)>0 else 'false')" 2>/dev/null)
  check "Sections returns section list" "$HAS_SECTIONS"
else
  echo "5. Live API calls (skipped — set TEST_API_KEY to run)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || echo "FAILURES DETECTED"
