#!/usr/bin/env bash
# Smoke test for Zenodo (UC-461) — open-access research repository
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
PASS=0
FAIL=0

ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== Zenodo Smoke Tests (UC-461) ==="

# 1. Health check
echo -n "1. Health..."
STATUS=$(curl -s "${API_URL}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
[ "$STATUS" = "ready" ] && ok "ready" || fail "health=$STATUS"

# 2. Tools in catalog
echo -n "2. Zenodo tools in catalog..."
COUNT=$(curl -s "${API_URL}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
z=[t for t in d['data'] if t['id'].startswith('zenodo.')]
print(len(z))
")
[ "$COUNT" -eq 4 ] && ok "4 tools" || fail "expected 4, got $COUNT"

# 3. Tool detail — zenodo.search
echo -n "3. zenodo.search detail..."
SCHEMA=$(curl -s "${API_URL}/api/v1/tools/zenodo.search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print(len(props))
")
[ "$SCHEMA" -ge 6 ] && ok "${SCHEMA} params" || fail "expected >=6 params, got $SCHEMA"

# 4. Tool detail — zenodo.record
echo -n "4. zenodo.record detail..."
SCHEMA=$(curl -s "${API_URL}/api/v1/tools/zenodo.record" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print(len(props))
")
[ "$SCHEMA" -ge 1 ] && ok "${SCHEMA} params" || fail "expected >=1 param, got $SCHEMA"

# 5. Tool detail — zenodo.files
echo -n "5. zenodo.files detail..."
SCHEMA=$(curl -s "${API_URL}/api/v1/tools/zenodo.files" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print(len(props))
")
[ "$SCHEMA" -ge 1 ] && ok "${SCHEMA} params" || fail "expected >=1 param, got $SCHEMA"

# 6. Tool detail — zenodo.communities
echo -n "6. zenodo.communities detail..."
SCHEMA=$(curl -s "${API_URL}/api/v1/tools/zenodo.communities" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print(len(props))
")
[ "$SCHEMA" -ge 3 ] && ok "${SCHEMA} params" || fail "expected >=3 params, got $SCHEMA"

# 7. Dashboard provider entry
echo -n "7. Dashboard provider entry..."
sudo docker exec apibase-redis-1 redis-cli DEL 'dashboard:data' > /dev/null 2>&1 || true
DASH=$(curl -s "${API_URL}/api/v1/dashboard" | python3 -c "
import sys,json; d=json.load(sys.stdin)
m=[p for p in d['providers'] if p.get('provider')=='zenodo']
print(m[0]['tool_count'] if m else 0)
" 2>/dev/null || echo "0")
[ "$DASH" -eq 4 ] && ok "zenodo: 4 tools on dashboard" || fail "dashboard: expected 4, got $DASH"

# 8. Live API call (Zenodo search via upstream)
echo -n "8. Upstream Zenodo API reachable..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "https://zenodo.org/api/records?q=climate&size=1")
[ "$HTTP" = "200" ] && ok "HTTP 200" || fail "HTTP $HTTP"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ "$FAIL" -eq 0 ] && echo "ALL PASS" && exit 0 || exit 1
