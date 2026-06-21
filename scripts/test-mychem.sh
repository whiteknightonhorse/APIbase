#!/usr/bin/env bash
# Test script for MyChem.info (UC-481)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
PASSED=0
FAILED=0

pass() { echo "  PASS: $1"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL: $1"; FAILED=$((FAILED + 1)); }

echo "=== MyChem.info Smoke Test (UC-481) ==="
echo "Target: $API_URL"
echo ""

# 1. Health check
echo "1/5 Health check..."
STATUS=$(curl -s "$API_URL/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && pass "health ready" || fail "health not ready: $STATUS"

# 2. Provider tools in catalog (must have 4)
echo "2/5 MyChem tools in catalog..."
COUNT=$(curl -s "$API_URL/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
tools = [t for t in d['data'] if t['id'].startswith('mychem.')]
print(len(tools))
")
[ "$COUNT" -eq 4 ] && pass "4 mychem tools found" || fail "expected 4, found $COUNT"

# 3. Tool detail endpoints (must return 200 with schema)
echo "3/5 Tool detail endpoints..."
for TOOL in mychem.search mychem.annotation mychem.batch_query mychem.metadata; do
  RESP=$(curl -s "$API_URL/api/v1/tools/$TOOL")
  HAS_SCHEMA=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('input_schema',{}).get('properties') else 'missing')")
  [ "$HAS_SCHEMA" = "ok" ] && pass "$TOOL has input_schema" || fail "$TOOL missing input_schema"
done

# 4. Live search (no auth needed, checks upstream reachability)
echo "4/5 Live upstream check (mychem.info/v1/query)..."
RESP=$(curl -s "https://mychem.info/v1/query?q=aspirin&size=1&fields=chebi.name")
TOTAL=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))")
[ "$TOTAL" -gt 0 ] && pass "upstream returned $TOTAL results for aspirin" || fail "upstream returned 0 results"

# 5. Live annotation (no auth needed)
echo "5/5 Live annotation check (mychem.info/v1/chem/{InChIKey})..."
RESP=$(curl -s "https://mychem.info/v1/chem/BSYNRYMUTXBXSQ-UHFFFAOYSA-N?fields=chebi.name,chembl.pref_name")
NAME=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('chembl',{}).get('pref_name','MISSING'))")
[ "$NAME" = "ASPIRIN" ] && pass "InChIKey lookup returned ASPIRIN" || fail "expected ASPIRIN, got $NAME"

echo ""
echo "=== Results: $PASSED passed, $FAILED failed ==="
[ "$FAILED" -eq 0 ] && echo "ALL PASS" || exit 1
