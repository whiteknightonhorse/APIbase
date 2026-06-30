#!/usr/bin/env bash
# Smoke test for DOAJ adapter (UC-551)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

ok() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== DOAJ Smoke Tests ==="

# 1. Health check
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
[ "$STATUS" = "ready" ] && ok "Health ready" || fail "Health not ready: $STATUS"

# 2. DOAJ tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t.get('provider')=='doaj']))
")
[ "$COUNT" = "4" ] && ok "4 DOAJ tools in catalog" || fail "Expected 4 DOAJ tools, got $COUNT"

# 3. Tool detail endpoints
for TOOL in journal_search journal_detail article_search article_detail; do
  HTTP=$(curl -so /dev/null -w "%{http_code}" "$BASE/api/v1/tools/doaj.${TOOL}")
  [ "$HTTP" = "200" ] && ok "GET /api/v1/tools/doaj.$TOOL → 200" || fail "doaj.$TOOL detail returned $HTTP"
done

# 4. Input schema populated
PROPS=$(curl -s "$BASE/api/v1/tools/doaj.journal_search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
")
[ "$PROPS" -ge "1" ] && ok "journal_search has $PROPS schema properties" || fail "Missing input_schema properties"

# 5. Live API calls (require TEST_API_KEY in env)
if [ -n "${TEST_API_KEY:-}" ]; then
  RESULT=$(curl -s -X POST "$BASE/api/v1/tools/doaj.journal_search/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"query":"ecology","page_size":2}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok:'+str(d.get('total',0))) if 'total' in d else print('err:'+d.get('error','?'))
")
  [[ "$RESULT" == ok:* ]] && ok "journal_search live: $RESULT" || fail "journal_search live: $RESULT"

  RESULT2=$(curl -s -X POST "$BASE/api/v1/tools/doaj.article_search/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"query":"machine learning","page_size":2}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok:'+str(d.get('total',0))) if 'total' in d else print('err:'+d.get('error','?'))
")
  [[ "$RESULT2" == ok:* ]] && ok "article_search live: $RESULT2" || fail "article_search live: $RESULT2"
else
  echo "  SKIP: Live API calls (set TEST_API_KEY to enable)"
fi

echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
