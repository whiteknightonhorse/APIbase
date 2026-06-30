#!/usr/bin/env bash
# Smoke test for Australian Business Register (ABR) — UC-543

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"; local expect="$3"
  if echo "$result" | grep -q "$expect"; then
    echo "  PASS: $label"; PASS=$((PASS+1))
  else
    echo "  FAIL: $label (expected '$expect' in response)"
    echo "    Got: $(echo "$result" | head -c 200)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== ABR (UC-543) Smoke Tests ==="

RES=$(curl -s "$BASE/health/ready")
check "Health ready" "$RES" '"status":"ready"'

RES=$(curl -s "$BASE/api/v1/tools")
check "abr.abn_lookup in catalog" "$RES" '"id":"abr.abn_lookup"'
check "abr.acn_lookup in catalog" "$RES" '"id":"abr.acn_lookup"'
check "abr.name_search in catalog" "$RES" '"id":"abr.name_search"'

RES=$(curl -s "$BASE/api/v1/tools/abr.abn_lookup")
check "abn_lookup detail 200" "$RES" '"id":"abr.abn_lookup"'
check "abn_lookup has input_schema" "$RES" '"input_schema"'

RES=$(curl -s "$BASE/api/v1/tools/abr.name_search")
check "name_search detail 200" "$RES" '"id":"abr.name_search"'
check "name_search has input_schema" "$RES" '"state"'

sudo docker exec apibase-redis-1 redis-cli DEL 'dashboard:data' >/dev/null 2>&1 || true
RES=$(curl -s "$BASE/api/v1/dashboard")
check "ABR in dashboard" "$RES" '"provider":"abr"'

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || exit 1
