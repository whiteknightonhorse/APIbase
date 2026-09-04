#!/usr/bin/env bash
# UC-681 Kartverket Stedsnavn (Norwegian Place Names) smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-681 Kartverket Stedsnavn Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 norway-kartverket-stedsnavn tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('norway-kartverket-stedsnavn.')))")
[ "$N" = "3" ] && check "3 norway-kartverket-stedsnavn tools in catalog" PASS || check "expected 3 norway-kartverket-stedsnavn tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 3 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in norway-kartverket-stedsnavn.search_names norway-kartverket-stedsnavn.search_by_point norway-kartverket-stedsnavn.get_place; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all norway-kartverket-stedsnavn tools have schema+desc" PASS || check "one or more norway-kartverket-stedsnavn tools missing schema or desc" FAIL

# 4. Dashboard registers norway-kartverket-stedsnavn
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='norway-kartverket-stedsnavn']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "norway-kartverket-stedsnavn in dashboard with tool_count=3" PASS \
  || check "norway-kartverket-stedsnavn missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/norway-kartverket-stedsnavn.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS norway-kartverket-stedsnavn routes in OpenAPI" PASS || check "expected 3+ norway-kartverket-stedsnavn routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — place name search for Oslo
echo "6/6 Upstream Kartverket Stedsnavn API"
OK=$(curl -s -m 20 "https://ws.geonorge.no/stedsnavn/v1/navn?sok=Oslo&treffPerSide=1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
n=d.get('navn',[])
print('1' if n and n[0].get('stedsnummer') is not None else '0')
" 2>/dev/null || echo "0")
[ "$OK" = "1" ] && check "place name search returned a valid stedsnummer record" PASS || check "place name search did not return a valid record" FAIL

echo
echo "=== Results ==="
echo "PASS: $PASS  FAIL: $FAIL"
