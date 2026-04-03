#!/usr/bin/env bash
# Smoke test for UC-326: WhoisJSON (2 tools)
set -uo pipefail
BASE="https://apibase.pro"
PASS=0; FAIL=0

pass() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); }

echo "=== WhoisJSON Smoke Test ==="

# 1. Health
if curl -sf "$BASE/health/ready" >/dev/null 2>&1; then pass "Health ready"; else fail "Health ready"; fi

# 2. Tools in catalog
WJ_COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; print(sum(1 for t in json.load(sys.stdin)['data'] if t['id'].startswith('whoisjson.')))")
if [ "$WJ_COUNT" -eq 2 ]; then pass "2 WhoisJSON tools in catalog ($WJ_COUNT)"; else fail "2 WhoisJSON tools ($WJ_COUNT)"; fi

# 3. Tool detail endpoints
for TOOL in whoisjson.ssl_check whoisjson.subdomains; do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/tools/$TOOL")
  if [ "$STATUS" = "200" ]; then pass "Tool detail $TOOL"; else fail "Tool detail $TOOL ($STATUS)"; fi
done

# 4. Upstream SSL check
VALID=$(curl -s -H "Authorization: TOKEN=$(grep PROVIDER_KEY_WHOISJSON /home/apibase/apibase/.env | cut -d= -f2-)" \
  "https://whoisjson.com/api/v1/ssl-cert-check?domain=apibase.pro" | python3 -c "import sys,json; print(json.load(sys.stdin).get('valid','?'))" 2>/dev/null)
if [ "$VALID" = "True" ]; then pass "Upstream SSL check → valid=$VALID"; else fail "Upstream SSL check → valid=$VALID"; fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -eq 0 ]; then echo "=== All tests passed ==="; else exit 1; fi
