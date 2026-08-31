#!/usr/bin/env bash
# UC-646 Socrata Open Data (SODA) smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-646 Socrata Open Data (SODA) Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 socrata tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools?limit=2000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('socrata.')))")
[ "$N" = "3" ] && check "3 socrata tools in catalog" PASS || check "expected 3 socrata tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in socrata.dataset_search socrata.dataset_metadata socrata.query_dataset; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all socrata tools have schema+desc" PASS || check "one or more socrata tools missing schema or desc" FAIL

# 4. Dashboard registers socrata
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='socrata']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "socrata in dashboard with tool_count=3" PASS \
  || check "socrata missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/socrata.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS socrata routes in OpenAPI" PASS || check "expected 3+ socrata routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — cross-portal Discovery API search plus a
# direct per-portal SODA data query against a well-known live dataset (NYC 311, erm2-nwe9).
echo "6/6 Upstream Socrata API"
VALUE=$(curl -s -m 15 "https://api.us.socrata.com/api/catalog/v1?domains=data.cityofnewyork.us&only=dataset&limit=1" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('results',[]); print('1' if r and r[0]['metadata']['domain']=='data.cityofnewyork.us' else '0')")
QUERY_OK=$(curl -s -m 15 "https://data.cityofnewyork.us/resource/erm2-nwe9.json?\$limit=1" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if isinstance(d, list) and len(d)==1 and 'unique_key' in d[0] else '0')")
[ "$VALUE" = "1" ] && [ "$QUERY_OK" = "1" ] && check "Socrata catalog search + NYC 311 SoQL query returned plausible data" PASS || check "Socrata upstream returned no/implausible value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
