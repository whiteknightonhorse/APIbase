#!/usr/bin/env bash
# Smoke test for CORDIS EU Research (UC-549)
set -euo pipefail

BASE="${1:-https://apibase.pro}"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"; PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc — $result"; FAIL=$((FAIL + 1))
  fi
}

echo "=== CORDIS EU Research smoke test ($BASE) ==="

# 1. Health
STATUS=$(curl -sf "$BASE/health/ready" | python3 -c "import sys,json; print('ok' if json.load(sys.stdin).get('status')=='ready' else 'fail')" 2>/dev/null || echo "fail")
check "Health ready" "$STATUS"

# 2. CORDIS tools in catalog
COUNT=$(curl -sf "$BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([t for t in d['data'] if t['id'].startswith('cordis')]))" 2>/dev/null || echo "0")
[ "$COUNT" -ge 4 ] && check "4 cordis tools in catalog" "ok" || check "4 cordis tools in catalog" "got $COUNT"

# 3. Tool detail — schema populated
for tool in cordis.project_search cordis.project_details cordis.organisation_search cordis.project_publications; do
  SCHEMA=$(curl -sf "$BASE/api/v1/tools/$tool" | python3 -c "import sys,json; t=json.load(sys.stdin); print('ok' if t.get('input_schema',{}).get('properties') else 'no-schema')" 2>/dev/null || echo "fail")
  check "Tool detail $tool has schema" "$SCHEMA"
done

# 4. Live SPARQL endpoint — project_search
SPARQL='PREFIX eurio: <http://data.europa.eu/s66#>
SELECT ?id ?title WHERE {
  ?p a eurio:Project ;
     eurio:identifier ?id ;
     eurio:title ?title .
  FILTER(CONTAINS(LCASE(str(?title)), "climate"))
} LIMIT 3'

LIVE=$(curl -sf \
  "https://cordis.europa.eu/datalab/sparql?query=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$SPARQL")" \
  -H "Accept: application/sparql-results+json" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); b=d.get('results',{}).get('bindings',[]); print('ok' if len(b)>0 else 'empty')" 2>/dev/null || echo "fail")
check "Live SPARQL project_search (climate)" "$LIVE"

# 5. Live SPARQL — organisation_search
SPARQL2='PREFIX eurio: <http://data.europa.eu/s66#>
SELECT ?id ?name WHERE {
  ?o a eurio:Organisation ;
     eurio:legalName ?name ;
     eurio:identifier ?id .
  FILTER(CONTAINS(LCASE(?name), "cambridge"))
} LIMIT 3'

LIVE2=$(curl -sf \
  "https://cordis.europa.eu/datalab/sparql?query=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$SPARQL2")" \
  -H "Accept: application/sparql-results+json" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); b=d.get('results',{}).get('bindings',[]); print('ok' if len(b)>0 else 'empty')" 2>/dev/null || echo "fail")
check "Live SPARQL organisation_search (cambridge)" "$LIVE2"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
