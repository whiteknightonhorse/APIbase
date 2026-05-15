#!/bin/bash
# NVD (NIST National Vulnerability Database) smoke tests (UC-413)
# Tests: health, catalog count, tool schemas, live CVE/CPE calls

set -e
BASE="https://apibase.pro"
PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "OK" ]; then
    echo "[PASS] $name"
    PASS=$((PASS+1))
  else
    echo "[FAIL] $name — $result"
    FAIL=$((FAIL+1))
  fi
}

echo "=== NVD Smoke Tests (UC-413) ==="

# 1. Health check
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
check "Health check" "$([ "$STATUS" = "ok" ] || [ "$STATUS" = "ready" ] && echo OK || echo "Got: $STATUS")"

# 2. NVD tools in catalog
NVD_COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; print(len([t for t in json.load(sys.stdin)['data'] if t['id'].startswith('nvd.')]))" 2>/dev/null)
check "NVD tools in catalog (expect 3)" "$([ "$NVD_COUNT" = "3" ] && echo OK || echo "Got: $NVD_COUNT")"

# 3. nvd.cve_detail schema
SCHEMA=$(curl -s "$BASE/api/v1/tools/nvd.cve_detail" | python3 -c "import sys,json; t=json.load(sys.stdin); print('OK' if t.get('input_schema',{}).get('properties',{}).get('cve_id') else 'missing cve_id')" 2>/dev/null)
check "nvd.cve_detail has cve_id schema" "$SCHEMA"

# 4. nvd.cve_search schema
SCHEMA2=$(curl -s "$BASE/api/v1/tools/nvd.cve_search" | python3 -c "import sys,json; t=json.load(sys.stdin); print('OK' if t.get('input_schema',{}).get('properties',{}).get('keyword') else 'missing keyword')" 2>/dev/null)
check "nvd.cve_search has keyword schema" "$SCHEMA2"

# 5. nvd.cpe_search schema
SCHEMA3=$(curl -s "$BASE/api/v1/tools/nvd.cpe_search" | python3 -c "import sys,json; t=json.load(sys.stdin); print('OK' if t.get('input_schema',{}).get('properties',{}).get('keyword') else 'missing keyword')" 2>/dev/null)
check "nvd.cpe_search has keyword schema" "$SCHEMA3"

# 6. Upstream CVE detail (Log4Shell) — no key, lower rate limit
UPSTREAM=$(curl -s --max-time 15 "https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2021-44228" | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('totalResults',0) > 0 else 'empty')" 2>/dev/null)
check "Upstream NVD API (Log4Shell)" "$UPSTREAM"

# 7. Upstream CVE search for openssl
UPSTREAM2=$(curl -s --max-time 15 "https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=openssl&resultsPerPage=5" | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('totalResults',0) > 0 else 'empty')" 2>/dev/null)
check "Upstream NVD CVE search (openssl)" "$UPSTREAM2"

# 8. Upstream CPE search for openssl
UPSTREAM3=$(curl -s --max-time 15 "https://services.nvd.nist.gov/rest/json/cpes/2.0?keywordSearch=openssl&resultsPerPage=5" | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('totalResults',0) > 0 else 'empty')" 2>/dev/null)
check "Upstream NVD CPE search (openssl)" "$UPSTREAM3"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ] && exit 0 || exit 1
