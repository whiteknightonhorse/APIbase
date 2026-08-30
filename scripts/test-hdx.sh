#!/usr/bin/env bash
# UC-638 Humanitarian Data Exchange (HDX) smoke test (4 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-638 Humanitarian Data Exchange (HDX) Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 4 hdx tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools?limit=2000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('hdx.')))")
[ "$N" = "4" ] && check "4 hdx tools in catalog" PASS || check "expected 4 hdx tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in hdx.dataset_search hdx.dataset_detail hdx.location_list hdx.organization_list; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all hdx tools have schema+desc" PASS || check "one or more hdx tools missing schema or desc" FAIL

# 4. Dashboard registers hdx
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='hdx']; sys.exit(0 if (m and m[0]['tool_count']==4) else 1)" \
  && check "hdx in dashboard with tool_count=4" PASS \
  || check "hdx missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/hdx.' in path))")
[ "$HITS" -ge 4 ] && check "$HITS hdx routes in OpenAPI" PASS || check "expected 4+ hdx routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — search + detail against the live HDX CKAN API
echo "6/6 Upstream HDX CKAN Action API"
VALUE=$(curl -s -m 15 "https://data.humdata.org/api/3/action/package_search?rows=1&q=food+security&fl=id,name,title" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d.get('success') and d['result']['count']>0 and d['result']['results'][0].get('title') else '0')")
[ "$VALUE" = "1" ] && check "HDX package_search returned plausible dataset data" PASS || check "HDX package_search returned no/implausible value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
