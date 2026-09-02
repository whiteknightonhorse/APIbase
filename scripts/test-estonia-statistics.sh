#!/usr/bin/env bash
# UC-670 Estonia Statistics (Statistics Estonia / Statistikaamet) smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-670 Estonia Statistics Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 estonia-statistics tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('estonia-statistics.')))")
[ "$N" = "3" ] && check "3 estonia-statistics tools in catalog" PASS || check "expected 3 estonia-statistics tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 3 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in estonia-statistics.catalog estonia-statistics.table_metadata estonia-statistics.table_query; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all estonia-statistics tools have schema+desc" PASS || check "one or more estonia-statistics tools missing schema or desc" FAIL

# 4. Dashboard registers estonia-statistics
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='estonia-statistics']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "estonia-statistics in dashboard with tool_count=3" PASS \
  || check "estonia-statistics missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/estonia-statistics.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS estonia-statistics routes in OpenAPI" PASS || check "expected 3+ estonia-statistics routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — births/deaths table, latest year live births
echo "6/6 Upstream PXWeb table query"
VALUE=$(curl -s -m 20 -X POST "https://andmed.stat.ee/api/v1/en/stat/rahvastik/rahvastikunaitajad-ja-koosseis/demograafilised-pehinaitajad/RV030.PX" \
  -H "Content-Type: application/json" \
  -d '{"query":[{"code":"Aasta","selection":{"filter":"top","values":["1"]}},{"code":"Näitaja","selection":{"filter":"item","values":["1"]}}],"response":{"format":"json-stat2"}}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['value'][0])")
[ "$VALUE" -gt 5000 ] 2>/dev/null && check "Estonia PXWeb RV030 latest live births = $VALUE" PASS || check "expected an Estonian live-births figure > 5,000, got $VALUE" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
