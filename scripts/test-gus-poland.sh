#!/usr/bin/env bash
# UC-617 GUS Poland BDL smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability
set -euo pipefail

BASE_URL="${BASE_URL:-https://apibase.pro}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-617 GUS Poland BDL Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 gus-poland tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('gus-poland.')))")
[ "$N" = "3" ] && check "3 gus-poland tools in catalog" PASS || check "expected 3 gus-poland tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 3 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in gus-poland.subjects gus-poland.variables gus-poland.data; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all gus-poland tools have schema+desc" PASS || check "one or more gus-poland tools missing schema or desc" FAIL

# 4. Dashboard registers gus-poland
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='gus-poland']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "gus-poland in dashboard with tool_count=3" PASS \
  || check "gus-poland missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/gus-poland.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS gus-poland routes in OpenAPI" PASS || check "expected 3+ gus-poland routes, got $HITS" FAIL

# 6. Upstream reachability (no auth)
echo "6/6 Upstream GUS BDL endpoint"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 15 "https://bdl.stat.gov.pl/api/v1/subjects?lang=en&format=json&page-size=1")
[ "$CODE" = "200" ] && check "bdl.stat.gov.pl/api/v1/subjects HTTP 200" PASS || check "bdl.stat.gov.pl/api/v1/subjects HTTP $CODE" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
