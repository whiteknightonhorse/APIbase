#!/usr/bin/env bash
# Smoke test for UC-345: OSV.dev (3 tools)
set -uo pipefail
BASE="https://apibase.pro"
PASS=0; FAIL=0
pass() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); }

echo "=== OSV.dev Smoke Test ==="

if curl -sf "$BASE/health/ready" >/dev/null 2>&1; then pass "Health ready"; else fail "Health ready"; fi

OSV_COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; print(sum(1 for t in json.load(sys.stdin)['data'] if t['id'].startswith('osv.')))")
if [ "$OSV_COUNT" -eq 3 ]; then pass "3 OSV tools ($OSV_COUNT)"; else fail "3 OSV tools ($OSV_COUNT)"; fi

for TOOL in osv.query osv.get osv.batch_query; do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/tools/$TOOL")
  if [ "$STATUS" = "200" ]; then pass "Tool detail $TOOL"; else fail "Tool detail $TOOL ($STATUS)"; fi
done

VULNS=$(curl -s -X POST "https://api.osv.dev/v1/query" -H "Content-Type: application/json" \
  -d '{"package":{"name":"lodash","ecosystem":"npm"},"version":"4.17.20"}' | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('vulns',[])))" 2>/dev/null)
if [ "$VULNS" -gt 0 ]; then pass "Upstream query → $VULNS vulns for lodash@4.17.20"; else fail "Upstream query → $VULNS"; fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -eq 0 ]; then echo "=== All tests passed ==="; else exit 1; fi
