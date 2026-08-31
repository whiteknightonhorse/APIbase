#!/usr/bin/env bash
# UC-647 NCBI E-utilities Taxonomy smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-647 NCBI E-utilities Taxonomy Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 ncbi-eutils tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools?limit=2000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('ncbi-eutils.')))")
[ "$N" = "3" ] && check "3 ncbi-eutils tools in catalog" PASS || check "expected 3 ncbi-eutils tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in ncbi-eutils.taxonomy_search ncbi-eutils.taxonomy_summary ncbi-eutils.taxonomy_lineage; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all ncbi-eutils tools have schema+desc" PASS || check "one or more ncbi-eutils tools missing schema or desc" FAIL

# 4. Dashboard registers ncbi-eutils
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='ncbi-eutils']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "ncbi-eutils in dashboard with tool_count=3" PASS \
  || check "ncbi-eutils missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/ncbi-eutils.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS ncbi-eutils routes in OpenAPI" PASS || check "expected 3+ ncbi-eutils routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — esearch for Panthera leo must resolve to
# TaxID 9689, and efetch's lineage XML for that TaxID must contain Felidae (family Panthera leo
# belongs to) — sanity-checks both the JSON and hand-parsed-XML code paths against live NCBI data.
echo "6/6 Upstream NCBI E-utilities API"
SEARCH_OK=$(curl -s -m 15 "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=taxonomy&term=Panthera%20leo&retmode=json" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if '9689' in d.get('esearchresult',{}).get('idlist',[]) else '0')")
LINEAGE_OK=$(curl -s -m 15 "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=taxonomy&id=9689&retmode=xml" \
  | grep -q '<ScientificName>Felidae</ScientificName>' && echo 1 || echo 0)
[ "$SEARCH_OK" = "1" ] && [ "$LINEAGE_OK" = "1" ] && check "NCBI taxonomy esearch + efetch lineage returned plausible data" PASS || check "NCBI E-utilities upstream returned no/implausible value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
