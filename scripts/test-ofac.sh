#!/usr/bin/env bash
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1" cmd="$2" expect="$3"
  result=$(eval "$cmd" 2>&1)
  if echo "$result" | grep -q "$expect"; then
    echo "PASS: $desc"
    PASS=$((PASS+1))
  else
    echo "FAIL: $desc"
    echo "  Expected: $expect"
    echo "  Got: ${result:0:200}"
    FAIL=$((FAIL+1))
  fi
}

echo "=== OFAC Sanctions List (UC-590) smoke tests ==="

check "Health check" \
  "curl -s ${BASE}/health/ready" \
  '"status":"ready"'

check "OFAC tools in catalog (4)" \
  "curl -s '${BASE}/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); n=len([t for t in d['data'] if t['id'].startswith('ofac.')]); print(n)\"" \
  "^4$"

check "ofac.sdn.search detail has schema" \
  "curl -s '${BASE}/api/v1/tools/ofac.sdn.search' | python3 -c \"import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))\"" \
  "True"

check "ofac.sdn.aliases detail has schema" \
  "curl -s '${BASE}/api/v1/tools/ofac.sdn.aliases' | python3 -c \"import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))\"" \
  "True"

check "ofac.meta.programs detail (200)" \
  "curl -s -o /dev/null -w '%{http_code}' '${BASE}/api/v1/tools/ofac.meta.programs'" \
  "200"

check "ofac.meta.publication_info detail (200)" \
  "curl -s -o /dev/null -w '%{http_code}' '${BASE}/api/v1/tools/ofac.meta.publication_info'" \
  "200"

check "ofac.sdn.search returns 402 (payment gate works)" \
  "curl -s -X POST '${BASE}/api/v1/tools/ofac.sdn.search/call' -H 'Content-Type: application/json' -d '{\"name\":\"GAZPROM\"}'" \
  "payment_required\|UNAUTHORIZED"

check "ofac.meta.publication_info returns 402 (payment gate works)" \
  "curl -s -X POST '${BASE}/api/v1/tools/ofac.meta.publication_info/call' -H 'Content-Type: application/json' -d '{}'" \
  "payment_required\|UNAUTHORIZED"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ $FAIL -eq 0 ] && echo "All OFAC tests PASSED" || exit 1
