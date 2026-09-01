#!/usr/bin/env bash
# UC-650 British Geological Survey OGC API smoke test (4 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-650 BGS OGC API Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 4 bgs-ogcapi tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools?limit=2000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('bgs-ogcapi.')))")
[ "$N" = "4" ] && check "4 bgs-ogcapi tools in catalog" PASS || check "expected 4 bgs-ogcapi tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in bgs-ogcapi.geology_bedrock bgs-ogcapi.earthquake_search bgs-ogcapi.borehole_search bgs-ogcapi.landslide_search; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all bgs-ogcapi tools have schema+desc" PASS || check "one or more bgs-ogcapi tools missing schema or desc" FAIL

# 4. Dashboard registers bgs-ogcapi
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='bgs-ogcapi']; sys.exit(0 if (m and m[0]['tool_count']==4) else 1)" \
  && check "bgs-ogcapi in dashboard with tool_count=4" PASS \
  || check "bgs-ogcapi missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/bgs-ogcapi.' in path))")
[ "$HITS" -ge 4 ] && check "$HITS bgs-ogcapi routes in OpenAPI" PASS || check "expected 4+ bgs-ogcapi routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — real bedrock geology lookup against the
# live BGS OGC API (ogcapi.bgs.ac.uk), run by the British Geological Survey, no documented
# rate limit. Uses a tight bbox near central London.
echo "6/6 Upstream BGS OGC API"
VALUE=$(curl -s -m 15 "https://ogcapi.bgs.ac.uk/collections/bgsgeology625kbedrock/items?bbox=-0.13,51.50,-0.11,51.52&limit=3&f=json&skipGeometry=true&properties=lex,lex_d,max_time_d,min_time_d" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d.get('features') and 'lex_d' in d['features'][0]['properties'] else '0')")
[ "$VALUE" = "1" ] && check "BGS bedrock geology lookup returned plausible data" PASS || check "BGS bedrock geology lookup returned no/implausible value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
