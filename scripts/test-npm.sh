#!/usr/bin/env bash
# Smoke test for UC-344: npm Registry (4 tools)
set -uo pipefail
BASE="https://apibase.pro"
PASS=0; FAIL=0

pass() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); }

echo "=== npm Registry Smoke Test ==="

if curl -sf "$BASE/health/ready" >/dev/null 2>&1; then pass "Health ready"; else fail "Health ready"; fi

NPM_COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; print(sum(1 for t in json.load(sys.stdin)['data'] if t['id'].startswith('npm.')))")
if [ "$NPM_COUNT" -eq 4 ]; then pass "4 npm tools in catalog ($NPM_COUNT)"; else fail "4 npm tools ($NPM_COUNT)"; fi

for TOOL in npm.package_info npm.downloads npm.search npm.versions; do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/tools/$TOOL")
  if [ "$STATUS" = "200" ]; then pass "Tool detail $TOOL"; else fail "Tool detail $TOOL ($STATUS)"; fi
done

UPSTREAM=$(curl -s "https://registry.npmjs.org/express/latest" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{d[\"name\"]} v{d[\"version\"]}')" 2>/dev/null)
if echo "$UPSTREAM" | grep -q "express v"; then pass "Upstream → $UPSTREAM"; else fail "Upstream → $UPSTREAM"; fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -eq 0 ]; then echo "=== All tests passed ==="; else exit 1; fi
