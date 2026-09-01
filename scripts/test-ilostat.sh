#!/usr/bin/env bash
# UC-651 ILOSTAT SDMX public REST API smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-651 ILOSTAT Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 ilostat tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools?limit=2000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('ilostat.')))")
[ "$N" = "3" ] && check "3 ilostat tools in catalog" PASS || check "expected 3 ilostat tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in ilostat.dataflows ilostat.structure ilostat.data; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all ilostat tools have schema+desc" PASS || check "one or more ilostat tools missing schema or desc" FAIL

# 4. Dashboard registers ilostat
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='ilostat']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "ilostat in dashboard with tool_count=3" PASS \
  || check "ilostat missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/ilostat.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS ilostat routes in OpenAPI" PASS || check "expected 3+ ilostat routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — real dataflow query against the live
# ILOSTAT SDMX API (sdmx.ilo.org), run by the International Labour Organization, no documented
# rate limit. Employment by sex/age dataflow, United States, annual, last observation.
echo "6/6 Upstream ILOSTAT SDMX API"
VALUE=$(curl -s -m 15 -H "Accept: application/vnd.sdmx.data+json;version=1.0" \
  "https://sdmx.ilo.org/rest/data/DF_EMP_TEMP_SEX_AGE_NB/USA.A..../?lastNObservations=1" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d.get('data',{}).get('dataSets',[{}])[0].get('series') else '0')")
[ "$VALUE" = "1" ] && check "ILOSTAT data query returned plausible series data" PASS || check "ILOSTAT data query returned no/implausible value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
