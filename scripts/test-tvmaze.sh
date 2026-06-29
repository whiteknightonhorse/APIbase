#!/usr/bin/env bash
# Smoke tests for TVMaze (UC-520)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0
FAIL=0

check() {
  local desc="$1"; local result="$2"
  if [ "$result" = "OK" ]; then
    echo "PASS: $desc"; PASS=$((PASS+1))
  else
    echo "FAIL: $desc — $result"; FAIL=$((FAIL+1))
  fi
}

# 1. Health check
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
check "Health ready" "$([ "$STATUS" = "ready" ] && echo OK || echo "$STATUS")"

# 2. TVMaze tools in catalog (expect 5)
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['provider']=='tvmaze']))
")
check "TVMaze tools in catalog (5)" "$([ "$COUNT" = "5" ] && echo OK || echo "got $COUNT")"

# 3. Tool detail endpoints return 200 with schema
for TOOL in tvmaze.show_search tvmaze.show_details tvmaze.show_episodes tvmaze.show_cast tvmaze.schedule; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/v1/tools/${TOOL}")
  check "Tool detail 200: ${TOOL}" "$([ "$HTTP" = "200" ] && echo OK || echo "HTTP $HTTP")"
done

# 4. Live API: search for Breaking Bad
if [ -n "${TEST_API_KEY:-}" ]; then
  RESULT=$(curl -s -X POST "${BASE}/api/v1/tools/tvmaze.show_search/call" \
    -H "Authorization: Bearer ${TEST_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"query":"Breaking Bad"}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
r=d.get('result',{})
print('OK' if r.get('count',0)>0 and r.get('results',[{}])[0].get('id')==169 else 'unexpected: '+str(r)[:100))
")
  check "Live: show_search Breaking Bad (id=169)" "$RESULT"

  # 5. Live API: schedule today US
  SCHED=$(curl -s -X POST "${BASE}/api/v1/tools/tvmaze.schedule/call" \
    -H "Authorization: Bearer ${TEST_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"country":"US"}' | python3 -c "
import sys,json; d=json.load(sys.stdin)
r=d.get('result',{})
print('OK' if r.get('count',0)>0 else 'empty: '+str(r)[:100))
")
  check "Live: schedule US today" "$SCHED"
else
  echo "SKIP: Live API tests (set TEST_API_KEY to enable)"
fi

echo ""
echo "=== TVMaze Smoke Test ==="
echo "Passed: ${PASS} / Failed: ${FAIL}"
[ "$FAIL" -eq 0 ] && echo "ALL PASS" && exit 0 || exit 1
