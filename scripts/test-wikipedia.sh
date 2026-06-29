#!/usr/bin/env bash
# UC-523 Wikipedia REST API smoke test
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS $label"; PASS=$((PASS+1))
  else
    echo "  FAIL $label: $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== Wikipedia REST API Smoke Test (UC-523) ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','err'))")
check "health/ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tool count (>= 809)
TOTAL=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
check "total tools >= 809" "$([ "$TOTAL" -ge 809 ] && echo ok || echo "got $TOTAL")"

# 3. Wikipedia tools in catalog (5 expected)
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json
d=json.load(sys.stdin)
n=len([t for t in d['data'] if t['id'].startswith('wikipedia.')])
print(n)
")
check "5 wikipedia tools in catalog" "$([ "$COUNT" -eq 5 ] && echo ok || echo "got $COUNT")"

# 4. Tool detail — article.summary
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/wikipedia.article.summary")
check "GET /api/v1/tools/wikipedia.article.summary → 200" "$([ "$HTTP" = "200" ] && echo ok || echo "HTTP $HTTP")"

# 5. Tool detail — search.pages
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/wikipedia.search.pages")
check "GET /api/v1/tools/wikipedia.search.pages → 200" "$([ "$HTTP" = "200" ] && echo ok || echo "HTTP $HTTP")"

# 6. Tool detail — feed.featured
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/wikipedia.feed.featured")
check "GET /api/v1/tools/wikipedia.feed.featured → 200" "$([ "$HTTP" = "200" ] && echo ok || echo "HTTP $HTTP")"

# 7. Tool detail — feed.on_this_day
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/wikipedia.feed.on_this_day")
check "GET /api/v1/tools/wikipedia.feed.on_this_day → 200" "$([ "$HTTP" = "200" ] && echo ok || echo "HTTP $HTTP")"

# 8. Tool detail — article.media
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/wikipedia.article.media")
check "GET /api/v1/tools/wikipedia.article.media → 200" "$([ "$HTTP" = "200" ] && echo ok || echo "HTTP $HTTP")"

# 9. Schema present (input_schema.properties not empty)
PROPS=$(curl -s "$BASE/api/v1/tools/wikipedia.article.summary" | python3 -c "
import sys,json; t=json.load(sys.stdin); print(len(t.get('input_schema',{}).get('properties',{})))
")
check "wikipedia.article.summary has input_schema props" "$([ "$PROPS" -ge 1 ] && echo ok || echo "props=$PROPS")"

# 10. Dashboard entry
DASH=$(curl -s "$BASE/api/v1/dashboard" | python3 -c "
import sys,json; d=json.load(sys.stdin)
m=[p for p in d['providers'] if p['provider']=='wikipedia']
print(m[0]['tool_count'] if m else 0)
")
check "wikipedia in dashboard with 5 tools" "$([ "$DASH" -eq 5 ] && echo ok || echo "got $DASH")"

# Live call (requires TEST_API_KEY)
if [ -n "${TEST_API_KEY:-}" ]; then
  echo ""
  echo "--- Live API calls (TEST_API_KEY set) ---"

  SUMMARY=$(curl -s -X POST "$BASE/api/v1/tools/wikipedia.article.summary/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"title":"Python_(programming_language)"}' | python3 -c "
import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('title','err'))
")
  check "live: article.summary → title" "$([ "$SUMMARY" = "Python (programming language)" ] && echo ok || echo "got: $SUMMARY")"

  SEARCH_COUNT=$(curl -s -X POST "$BASE/api/v1/tools/wikipedia.search.pages/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"query":"machine learning","limit":5}' | python3 -c "
import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('count',0))
")
  check "live: search.pages → count >= 1" "$([ "${SEARCH_COUNT:-0}" -ge 1 ] && echo ok || echo "count=$SEARCH_COUNT")"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
