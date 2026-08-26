#!/bin/bash
# Smoke test for Federal Register API — rules/notices/agencies/public inspection (UC-605)
# Tests: health, catalog presence, tool details, live upstream API calls

set -e
BASE="https://apibase.pro"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc — $result"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Federal Register API Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='federalregister']
print(len(n))
" 2>/dev/null)
check "4 federalregister tools in catalog" "$([ "$COUNT" = "4" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
for TOOL in federalregister.search federalregister.document federalregister.agencies federalregister.public_inspection; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
  check "$TOOL schema populated" "$HAS_SCHEMA"
done

# 4. Live upstream API calls (federalregister.gov, no auth needed)
SEARCH_OK=$(curl -s "https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=climate&per_page=2" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok' if d.get('count',0) > 0 and len(d.get('results',[])) > 0 else 'no results')
" 2>/dev/null)
check "Live: full-text document search" "$SEARCH_OK"

AGENCIES_OK=$(curl -s "https://www.federalregister.gov/api/v1/agencies.json" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok' if isinstance(d, list) and len(d) > 100 else 'unexpected shape')
" 2>/dev/null)
check "Live: agencies list" "$AGENCIES_OK"

PI_OK=$(curl -s "https://www.federalregister.gov/api/v1/public-inspection-documents/current.json" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok' if 'results' in d and isinstance(d['results'], list) else 'unexpected shape')
" 2>/dev/null)
check "Live: current public inspection documents" "$PI_OK"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
