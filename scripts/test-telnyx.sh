#!/usr/bin/env bash
# UC-395 Telnyx CPaaS smoke test (4 tools)
# Verifies: catalog presence, tool detail schema, upstream auth (telnyx.balance live)
set -euo pipefail

BASE_URL="${BASE_URL:-https://apibase.pro}"
TELNYX_API_KEY="${TELNYX_API_KEY:-$(grep ^TELNYX_API_KEY= .env 2>/dev/null | cut -d= -f2-)}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-395 Telnyx Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
RES=$(curl -s "$BASE_URL/health/ready")
echo "$RES" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready ($RES)" FAIL

# 2. Catalog has 4 telnyx tools
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('telnyx.')))")
[ "$N" = "4" ] && check "4 telnyx tools in catalog" PASS || check "expected 4 telnyx tools, got $N" FAIL

# 3. Each tool has a real schema + non-trivial description
echo "3/6 Tool detail schemas"
for t in telnyx.send_sms telnyx.message_status telnyx.list_messages telnyx.balance; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$t")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] && check "$t schema+desc" PASS || check "$t missing schema or desc" FAIL
done

# 4. Dashboard registers telnyx
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='telnyx']; sys.exit(0 if (m and m[0]['tool_count']==4) else 1)" && check "telnyx in dashboard with tool_count=4" PASS || check "telnyx missing from dashboard" FAIL

# 5. MPP/x402 discovery — telnyx tools appear in OpenAPI with x-payment-info
echo "5/6 OpenAPI MPP discovery"
SPEC=$(curl -s "$BASE_URL/.well-known/openapi.json")
HITS=$(echo "$SPEC" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path,m in s.get('paths',{}).items() if 'telnyx' in path))")
[ "$HITS" -gt 0 ] && check "$HITS telnyx routes in OpenAPI" PASS || check "no telnyx routes in OpenAPI (regen with scripts/generate-openapi.ts)" FAIL

# 6. Upstream Telnyx auth + balance
echo "6/6 Upstream Telnyx /v2/balance"
if [ -n "$TELNYX_API_KEY" ]; then
  R=$(curl -s -H "Authorization: Bearer $TELNYX_API_KEY" https://api.telnyx.com/v2/balance)
  echo "$R" | grep -q '"balance"' && check "Telnyx /v2/balance live" PASS || check "Telnyx /v2/balance failed: $R" FAIL
else
  red "  SKIP  TELNYX_API_KEY not set — skipping live upstream test"
fi

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
