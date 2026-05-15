#!/usr/bin/env bash
# Smoke test for USAJOBS adapter (UC-415)
set -euo pipefail

API_BASE="https://apibase.pro"
TOOL_PREFIX="usajobs"
EXPECTED_TOOLS=3

echo "=== USAJOBS (UC-415) Smoke Test ==="

# 1. Health check
echo -n "1/5 Health check... "
STATUS=$(curl -s "${API_BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
if [ "$STATUS" = "ready" ]; then echo "PASS"; else echo "FAIL: $STATUS"; exit 1; fi

# 2. Provider tools in catalog
echo -n "2/5 Provider tools in catalog... "
COUNT=$(curl -s "${API_BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
tools=[t for t in d['data'] if t['id'].startswith('${TOOL_PREFIX}.')]
print(len(tools))
")
if [ "$COUNT" -eq "$EXPECTED_TOOLS" ]; then
  echo "PASS ($COUNT tools)"
else
  echo "FAIL: expected $EXPECTED_TOOLS, got $COUNT"
  exit 1
fi

# 3. Tool detail endpoints (200)
echo -n "3/5 Tool detail endpoints... "
FAILS=0
for TOOL in search position_detail code_lists; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${API_BASE}/api/v1/tools/${TOOL_PREFIX}.${TOOL}")
  if [ "$HTTP" != "200" ]; then
    echo "FAIL: ${TOOL_PREFIX}.${TOOL} returned $HTTP"
    FAILS=$((FAILS+1))
  fi
done
if [ $FAILS -eq 0 ]; then echo "PASS"; else exit 1; fi

# 4. Schema validation — usajobs.search has input_schema properties
echo -n "4/5 Schema properties present... "
HAS_SCHEMA=$(curl -s "${API_BASE}/api/v1/tools/usajobs.search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('yes' if t.get('input_schema',{}).get('properties') else 'no')
")
if [ "$HAS_SCHEMA" = "yes" ]; then echo "PASS"; else echo "FAIL: no input_schema properties"; exit 1; fi

# 5. Upstream API call (requires TEST_API_KEY or live key)
echo -n "5/5 Upstream API verification... "
KEY=$(grep PROVIDER_KEY_USAJOBS /home/apibase/apibase/.env 2>/dev/null | cut -d= -f2- || echo "")
if [ -z "$KEY" ]; then
  echo "SKIP (no PROVIDER_KEY_USAJOBS)"
else
  RESULT=$(curl -s \
    -H "Authorization-Key: $KEY" \
    -H "User-Agent: whiteknightonhorse@gmail.com" \
    -H "Host: data.usajobs.gov" \
    "https://data.usajobs.gov/api/search?Keyword=engineer&ResultsPerPage=1" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d['SearchResult']['SearchResultCountAll'])" 2>/dev/null || echo "0")
  if [ "$RESULT" -gt "0" ] 2>/dev/null; then
    echo "PASS ($RESULT total results for 'engineer')"
  else
    echo "FAIL: no results returned"
    exit 1
  fi
fi

echo ""
echo "=== All USAJOBS smoke tests passed ==="
