#!/usr/bin/env bash
# Smoke test for p2pquake (UC-592) — Japan JMA seismic API
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "PASS: $label"; PASS=$((PASS + 1))
  else
    echo "FAIL: $label"; FAIL=$((FAIL + 1))
  fi
}

echo "=== P2PQuake smoke tests ==="

# 1. Health check
check "Health ready" "curl -sf ${BASE}/health/ready"

# 2. Provider tools in catalog
check "3 p2pquake tools in catalog" "curl -sf '${BASE}/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); tools=[t for t in d['data'] if t['provider']=='p2pquake']; assert len(tools)==3, f'{len(tools)} tools'\""

# 3. Tool detail endpoints (input_schema populated)
check "recent_quakes detail" "curl -sf '${BASE}/api/v1/tools/p2pquake.recent_quakes' | python3 -c \"import sys,json; t=json.load(sys.stdin); assert t.get('input_schema',{}).get('properties')\""
check "tsunami_warnings detail" "curl -sf '${BASE}/api/v1/tools/p2pquake.tsunami_warnings' | python3 -c \"import sys,json; t=json.load(sys.stdin); assert t.get('input_schema',{}).get('properties')\""
check "quake_history detail" "curl -sf '${BASE}/api/v1/tools/p2pquake.quake_history' | python3 -c \"import sys,json; t=json.load(sys.stdin); assert t.get('input_schema',{}).get('properties')\""

# 4. Upstream API reachability
check "Upstream API reachable" "curl -sf 'https://api.p2pquake.net/v2/jma/quake?limit=1' | python3 -c \"import sys,json; d=json.load(sys.stdin); assert len(d)>=1\""
check "Tsunami endpoint reachable" "curl -sf 'https://api.p2pquake.net/v2/jma/tsunami?limit=1' | python3 -c \"import sys,json; d=json.load(sys.stdin); assert isinstance(d, list)\""

# 5. Auth enforcement (401 for invalid key)
check "Auth enforced on call" "curl -s -X POST '${BASE}/api/v1/tools/p2pquake.recent_quakes/call' -H 'Authorization: Bearer ak_test_invalid' -H 'Content-Type: application/json' -d '{\"limit\":1}' | python3 -c \"import sys,json; r=json.load(sys.stdin); assert r.get('error') in ('unauthorized','payment_required')\""

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || exit 1
