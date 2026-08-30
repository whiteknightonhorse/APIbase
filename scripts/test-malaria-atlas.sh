#!/usr/bin/env bash
# UC-640 Malaria Atlas Project (MAP) smoke test (4 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-640 Malaria Atlas Project (MAP) Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 4 malaria-atlas tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools?limit=2000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('malaria-atlas.')))")
[ "$N" = "4" ] && check "4 malaria-atlas tools in catalog" PASS || check "expected 4 malaria-atlas tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in malaria-atlas.parasite_rate_survey malaria-atlas.case_estimates malaria-atlas.vector_occurrence malaria-atlas.country_list; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all malaria-atlas tools have schema+desc" PASS || check "one or more malaria-atlas tools missing schema or desc" FAIL

# 4. Dashboard registers malaria-atlas
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='malaria-atlas']; sys.exit(0 if (m and m[0]['tool_count']==4) else 1)" \
  && check "malaria-atlas in dashboard with tool_count=4" PASS \
  || check "malaria-atlas missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/malaria-atlas.' in path))")
[ "$HITS" -ge 4 ] && check "$HITS malaria-atlas routes in OpenAPI" PASS || check "expected 4+ malaria-atlas routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — country_list search against the live MAP WFS
echo "6/6 Upstream Malaria Atlas GeoServer WFS"
VALUE=$(curl -s -m 15 -G "https://data.malariaatlas.org/geoserver/ows" \
  --data-urlencode "service=WFS" --data-urlencode "version=2.0.0" --data-urlencode "request=GetFeature" \
  --data-urlencode "typeName=Explorer:mapadmin_0_2022" --data-urlencode "outputFormat=application/json" \
  --data-urlencode "propertyName=iso,iso2,name_0" --data-urlencode "CQL_FILTER=name_0 ILIKE '%kenya%'" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d.get('totalFeatures',0)>0 and d['features'][0]['properties'].get('iso')=='KEN' else '0')")
[ "$VALUE" = "1" ] && check "MAP WFS country_list returned plausible data (Kenya=KEN)" PASS || check "MAP WFS returned no/implausible value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
