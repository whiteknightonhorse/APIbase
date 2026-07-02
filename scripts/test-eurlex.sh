#!/bin/bash
# Smoke test for EUR-Lex Cellar (UC-587)
set -e

BASE="https://apibase.pro"
PROVIDER="eurlex"
TOOLS=4
GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; exit 1; }

echo "=== EUR-Lex Cellar smoke test ==="

# 1. Health
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))")
[ "$STATUS" = "ready" ] && pass "Health: $STATUS" || fail "Health: $STATUS"

# 2. Tools in catalog
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['id'].startswith('eurlex.')]))
")
[ "$COUNT" = "$TOOLS" ] && pass "Catalog: $COUNT/${TOOLS} tools" || fail "Catalog: got $COUNT expected ${TOOLS}"

# 3. Tool detail + schema
for TOOL in eurlex.legislation.search eurlex.legislation.recent eurlex.legislation.detail eurlex.legislation.by_type; do
  RESULT=$(curl -s "${BASE}/api/v1/tools/${TOOL}" | python3 -c "
import sys,json; t=json.load(sys.stdin)
has_schema = bool(t.get('input_schema',{}).get('properties'))
has_desc = t.get('description','') != t.get('name','')
print('OK' if has_schema and has_desc else 'FAIL')
")
  [ "$RESULT" = "OK" ] && pass "Detail: ${TOOL}" || fail "Detail: ${TOOL} (missing schema or description)"
done

# 4. SPARQL endpoint reachable (live connectivity test)
SPARQL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://publications.europa.eu/webapi/rdf/sparql?query=SELECT+%3Fs+WHERE+%7B+%3Fs+a+%3Chttp%3A%2F%2Fpublications.europa.eu%2Fontology%2Fcdm%23work%3E+%7D+LIMIT+1&format=application/sparql-results+json")
[ "$SPARQL_STATUS" = "200" ] && pass "EUR-Lex SPARQL endpoint: HTTP ${SPARQL_STATUS}" || fail "EUR-Lex SPARQL endpoint: HTTP ${SPARQL_STATUS}"

echo "=== All tests passed ==="
