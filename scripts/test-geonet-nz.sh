#!/usr/bin/env bash
# UC-649 GeoNet New Zealand smoke test (4 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-649 GeoNet New Zealand Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 4 geonet-nz tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools?limit=2000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('geonet-nz.')))")
[ "$N" = "4" ] && check "4 geonet-nz tools in catalog" PASS || check "expected 4 geonet-nz tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in geonet-nz.quake_search geonet-nz.quake_detail geonet-nz.quake_stats geonet-nz.volcano_alert_level; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all geonet-nz tools have schema+desc" PASS || check "one or more geonet-nz tools missing schema or desc" FAIL

# 4. Dashboard registers geonet-nz
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='geonet-nz']; sys.exit(0 if (m and m[0]['tool_count']==4) else 1)" \
  && check "geonet-nz in dashboard with tool_count=4" PASS \
  || check "geonet-nz missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/geonet-nz.' in path))")
[ "$HITS" -ge 4 ] && check "$HITS geonet-nz routes in OpenAPI" PASS || check "expected 4+ geonet-nz routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — real quake-stats lookup against the
# live GeoNet API (api.geonet.org.nz), run by GNS Science, no documented rate limit.
echo "6/6 Upstream GeoNet API"
VALUE=$(curl -s -m 15 -H "Accept: application/json;version=2" "https://api.geonet.org.nz/quake/stats" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if 'magnitudeCount' in d and 'days7' in d['magnitudeCount'] else '0')")
[ "$VALUE" = "1" ] && check "GeoNet quake/stats lookup returned plausible data" PASS || check "GeoNet quake/stats lookup returned no/implausible value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
