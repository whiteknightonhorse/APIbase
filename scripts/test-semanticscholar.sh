#!/usr/bin/env bash
# UC-675 Semantic Scholar Graph API smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-675 Semantic Scholar Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 semanticscholar tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('semanticscholar.')))")
[ "$N" = "3" ] && check "3 semanticscholar tools in catalog" PASS || check "expected 3 semanticscholar tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 3 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in semanticscholar.papers_search semanticscholar.authors_search semanticscholar.get_paper; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all semanticscholar tools have schema+desc" PASS || check "one or more semanticscholar tools missing schema or desc" FAIL

# 4. Dashboard registers semanticscholar
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='semanticscholar']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "semanticscholar in dashboard with tool_count=3" PASS \
  || check "semanticscholar missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/semanticscholar.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS semanticscholar routes in OpenAPI" PASS || check "expected 3+ semanticscholar routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — search for "machine learning" must
# return a non-trivial result count (real corpus is 200M+ papers).
echo "6/6 Upstream Semantic Scholar API"
COUNT=$(curl -s -m 20 "https://api.semanticscholar.org/graph/v1/paper/search?query=machine+learning&limit=1" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total', 0))")
python3 -c "import sys; c=int('$COUNT'); sys.exit(0 if c > 100000 else 1)" \
  && check "Semantic Scholar paper search 'machine learning' = $COUNT results" PASS \
  || check "expected >100000 results, got $COUNT" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
