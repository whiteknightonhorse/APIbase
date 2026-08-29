#!/usr/bin/env bash
# UC-632 Wikimedia Analytics smoke test (4 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-632 Wikimedia Analytics Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 4 wikimedia-analytics tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools?limit=2000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('wikimedia-analytics.')))")
[ "$N" = "4" ] && check "4 wikimedia-analytics tools in catalog" PASS || check "expected 4 wikimedia-analytics tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 4 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in wikimedia-analytics.pageviews_aggregate wikimedia-analytics.pageviews_top wikimedia-analytics.pageviews_per_article wikimedia-analytics.edits_aggregate; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all wikimedia-analytics tools have schema+desc" PASS || check "one or more wikimedia-analytics tools missing schema or desc" FAIL

# 4. Dashboard registers wikimedia-analytics
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='wikimedia-analytics']; sys.exit(0 if (m and m[0]['tool_count']==4) else 1)" \
  && check "wikimedia-analytics in dashboard with tool_count=4" PASS \
  || check "wikimedia-analytics missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/wikimedia-analytics.' in path))")
[ "$HITS" -ge 4 ] && check "$HITS wikimedia-analytics routes in OpenAPI" PASS || check "expected 4+ wikimedia-analytics routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — en.wikipedia daily pageviews aggregate
echo "6/6 Upstream Wikimedia Analytics API"
VALUE=$(curl -s -m 15 "https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/en.wikipedia/all-access/all-agents/daily/20260801/20260803" \
  -H "User-Agent: APIbase/1.0 (https://apibase.pro; contact@apibase.pro)" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('items',[]); print('1' if items and items[0].get('project')=='en.wikipedia' and int(items[0].get('views',0))>0 else '0')")
[ "$VALUE" = "1" ] && check "Wikimedia Analytics API returned plausible en.wikipedia pageview data" PASS || check "Wikimedia Analytics API returned no/implausible value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
