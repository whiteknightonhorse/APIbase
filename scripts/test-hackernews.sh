#!/bin/bash
# Smoke test for HackerNews Firebase adapter (UC-521)
set -e

BASE_URL="${1:-https://apibase.pro}"
echo "Testing HackerNews Firebase (UC-521) at $BASE_URL"

# 1. Health check
echo -n "1/4 Health... "
STATUS=$(curl -s "${BASE_URL}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL: $STATUS"; exit 1; }

# 2. HackerNews tools in catalog (5 expected)
echo -n "2/4 Catalog (5 hackernews tools)... "
COUNT=$(curl -s "${BASE_URL}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['id'].startswith('hackernews.')]))")
[ "$COUNT" = "5" ] && echo "PASS ($COUNT tools)" || { echo "FAIL: expected 5, got $COUNT"; exit 1; }

# 3. Tool detail endpoints
echo -n "3/4 Tool details (5 endpoints)... "
FAIL=0
for TOOL in hackernews.top_stories hackernews.new_stories hackernews.best_stories hackernews.item_details hackernews.user_profile; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/v1/tools/${TOOL}")
  [ "$HTTP" = "200" ] || { echo "FAIL: ${TOOL} returned ${HTTP}"; FAIL=1; }
done
[ "$FAIL" = "0" ] && echo "PASS" || exit 1

# 4. Upstream API health (Firebase endpoint)
echo -n "4/4 Upstream Firebase endpoint... "
MAXITEM=$(curl -s "https://hacker-news.firebaseio.com/v0/maxitem.json")
[ "$MAXITEM" -gt 0 ] 2>/dev/null && echo "PASS (maxitem=$MAXITEM)" || { echo "FAIL: unexpected response '$MAXITEM'"; exit 1; }

echo ""
echo "=== HackerNews Firebase smoke tests: 4/4 PASS ==="
