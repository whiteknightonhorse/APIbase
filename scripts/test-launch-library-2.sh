#!/usr/bin/env bash
# UC-645 Launch Library 2 (The Space Devs) smoke test (4 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-645 Launch Library 2 (The Space Devs) Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 4 launch-library-2 tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools?limit=2000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('launch-library-2.')))")
[ "$N" = "4" ] && check "4 launch-library-2 tools in catalog" PASS || check "expected 4 launch-library-2 tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in launch-library-2.upcoming_launches launch-library-2.launch_detail launch-library-2.astronaut_search launch-library-2.agency_search; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all launch-library-2 tools have schema+desc" PASS || check "one or more launch-library-2 tools missing schema or desc" FAIL

# 4. Dashboard registers launch-library-2
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='launch-library-2']; sys.exit(0 if (m and m[0]['tool_count']==4) else 1)" \
  && check "launch-library-2 in dashboard with tool_count=4" PASS \
  || check "launch-library-2 missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/launch-library-2.' in path))")
[ "$HITS" -ge 4 ] && check "$HITS launch-library-2 routes in OpenAPI" PASS || check "expected 4+ launch-library-2 routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — real agency lookup against the live
# Launch Library 2 API. NOTE: the free tier is throttled to 15 requests/hour per IP — this
# script intentionally makes only ONE upstream call to conserve that shared budget.
echo "6/6 Upstream Launch Library 2 API"
VALUE=$(curl -s -m 15 "https://ll.thespacedevs.com/2.3.0/agencies/?search=spacex&limit=1" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('results',[]); print('1' if r and r[0].get('name')=='SpaceX' else '0')")
[ "$VALUE" = "1" ] && check "Launch Library 2 agency lookup returned plausible data (SpaceX)" PASS || check "Launch Library 2 agency lookup returned no/implausible value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
