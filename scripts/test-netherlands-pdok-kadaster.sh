#!/usr/bin/env bash
# UC-680 PDOK Kadaster Kadastrale Kaart smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-680 PDOK Kadaster Kadastrale Kaart Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 netherlands-pdok-kadaster tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('netherlands-pdok-kadaster.')))")
[ "$N" = "3" ] && check "3 netherlands-pdok-kadaster tools in catalog" PASS || check "expected 3 netherlands-pdok-kadaster tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 3 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in netherlands-pdok-kadaster.search_percelen netherlands-pdok-kadaster.get_perceel netherlands-pdok-kadaster.search_bebouwing; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all netherlands-pdok-kadaster tools have schema+desc" PASS || check "one or more netherlands-pdok-kadaster tools missing schema or desc" FAIL

# 4. Dashboard registers netherlands-pdok-kadaster
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='netherlands-pdok-kadaster']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "netherlands-pdok-kadaster in dashboard with tool_count=3" PASS \
  || check "netherlands-pdok-kadaster missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/netherlands-pdok-kadaster.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS netherlands-pdok-kadaster routes in OpenAPI" PASS || check "expected 3+ netherlands-pdok-kadaster routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — cadastral parcel search near Amsterdam
echo "6/6 Upstream PDOK Kadaster API"
OK=$(curl -s -m 20 "https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1/collections/perceel/items?f=json&limit=1&bbox=4.89,52.37,4.90,52.38" | python3 -c "
import sys,json
d=json.load(sys.stdin)
f=d.get('features',[])
print('1' if f and f[0].get('properties',{}).get('perceelnummer') is not None else '0')
" 2>/dev/null || echo "0")
[ "$OK" = "1" ] && check "perceel search returned a valid cadastral parcel record" PASS || check "perceel search did not return a valid record" FAIL

echo
echo "=== Results ==="
echo "PASS: $PASS  FAIL: $FAIL"
