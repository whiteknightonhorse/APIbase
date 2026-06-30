#!/usr/bin/env bash
# Test script for BioModels adapter (UC-554)

set -euo pipefail
API_URL="https://apibase.pro"
PROVIDER="biomodels"
TOOLS=("biomodels.model.search" "biomodels.model.detail" "biomodels.model.files" "biomodels.model.latest")

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

echo "=== BioModels Smoke Test (UC-554) ==="

# 1. Health check
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/ready")
[ "$HTTP" = "200" ] && pass "Health check" || fail "Health check: HTTP $HTTP"

# 2. Provider tools in catalog
COUNT=$(curl -s "$API_URL/api/v1/tools" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(sum(1 for t in d['data'] if t.get('provider') == 'biomodels'))
")
[ "$COUNT" -eq 4 ] && pass "4 biomodels tools in catalog" || fail "Expected 4 biomodels tools, got $COUNT"

# 3. Tool detail endpoints
for TOOL in "${TOOLS[@]}"; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/$TOOL")
  [ "$HTTP" = "200" ] && pass "Tool detail: $TOOL" || fail "Tool detail $TOOL: HTTP $HTTP"
done

# 4. Input schema present on first tool
SCHEMA=$(curl -s "$API_URL/api/v1/tools/biomodels.model.search" | python3 -c "
import sys, json
t = json.load(sys.stdin)
props = t.get('input_schema', {}).get('properties', {})
print(len(props))
")
[ "$SCHEMA" -ge 2 ] && pass "Schema has $SCHEMA properties" || fail "Schema missing properties"

echo "=== All tests passed ==="
