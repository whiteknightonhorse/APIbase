#!/bin/bash
# Smoke test for Unpaywall — Open-Access Full-Text Finder (UC-598)
# Tests: health, catalog presence, tool details, live upstream API call

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

echo "=== Unpaywall Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='unpaywall']
print(len(n))
" 2>/dev/null)
check "1 unpaywall tool in catalog" "$([ "$COUNT" = "1" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/unpaywall.oa_lookup" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
check "unpaywall.oa_lookup schema populated" "$HAS_SCHEMA"

# 4. Live upstream API call (api.unpaywall.org, no auth, courtesy email only)
LOOKUP=$(curl -s "https://api.unpaywall.org/v2/10.1038/nature12373?email=contact@apibase.pro" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('doi') and 'is_oa' in d else 'bad_response')
" 2>/dev/null)
check "Unpaywall OA lookup API live (nature12373)" "$LOOKUP"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ] && echo "ALL PASS" || exit 1
