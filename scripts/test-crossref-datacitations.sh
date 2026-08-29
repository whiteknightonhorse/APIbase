#!/usr/bin/env bash
# UC-634 CrossRef Data Citations smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-634 CrossRef Data Citations Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 crossref-datacitations tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools?limit=2000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('crossref-datacitations.')))")
[ "$N" = "3" ] && check "3 crossref-datacitations tools in catalog" PASS || check "expected 3 crossref-datacitations tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 3 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in crossref-datacitations.dataset_citations crossref-datacitations.article_datasets crossref-datacitations.recent_citations; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all crossref-datacitations tools have schema+desc" PASS || check "one or more crossref-datacitations tools missing schema or desc" FAIL

# 4. Dashboard registers crossref-datacitations
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='crossref-datacitations']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "crossref-datacitations in dashboard with tool_count=3" PASS \
  || check "crossref-datacitations missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/crossref-datacitations.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS crossref-datacitations routes in OpenAPI" PASS || check "expected 3+ crossref-datacitations routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — known dataset DOI with confirmed citations
echo "6/6 Upstream CrossRef Data Citations API"
TOTAL=$(curl -s -m 20 "https://api.crossref.org/beta/datacitations/?object-id=10.1037/e495862006-009&mailto=infocitysms@gmail.com" \
  | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d['message']['total-results'])
except Exception:
    print('0')
")
[ "$TOTAL" -ge 1 ] 2>/dev/null && check "upstream returned $TOTAL citation(s) for known dataset DOI" PASS || check "upstream returned no citations for known dataset DOI" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS/6"
if [ "$FAIL" -eq 0 ]; then
  echo "=== All crossref-datacitations smoke tests passed ==="
  exit 0
else
  echo "=== $FAIL test(s) FAILED ==="
  exit 1
fi
