#!/usr/bin/env bash
# NASA EONET smoke test (UC-477)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"; PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc — $result"; FAIL=$((FAIL + 1))
  fi
}

echo "=== NASA EONET smoke test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','fail'))" 2>/dev/null)
check "Health check" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. EONET tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=sum(1 for t in d['data'] if t['id'].startswith('eonet.'))
print(n)
" 2>/dev/null)
check "EONET tools in catalog (expect 4)" "$([ "$COUNT" = "4" ] && echo ok || echo "got $COUNT")"

# 3. Tool details
for TOOL in eonet.events eonet.event_detail eonet.categories eonet.layers; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  check "Tool detail $TOOL (200)" "$([ "$HTTP" = "200" ] && echo ok || echo "HTTP $HTTP")"
done

# 4. Live API call — categories (no auth needed for public EONET)
if [ -n "${TEST_API_KEY:-}" ]; then
  RESP=$(curl -s -X POST "$BASE/api/v1/tools/eonet.categories/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{}')
  HAS_CATS=$(echo "$RESP" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if 'categories' in str(d) or 'wildfires' in str(d) else 'fail')
" 2>/dev/null)
  check "Live call: eonet.categories" "$HAS_CATS"
else
  echo "  SKIP: Live API call (set TEST_API_KEY to enable)"
fi

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" = "0" ] && exit 0 || exit 1
