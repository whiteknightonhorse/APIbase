#!/usr/bin/env bash
# Smoke test for Open Trivia Database (UC-584)
set -uo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1" result="$2" expect="$3"
  if echo "$result" | grep -q "$expect"; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label — expected '$expect' in: $(echo "$result" | head -c 120)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Open Trivia Database Smoke Tests (UC-584) ==="

# 1. Health
check "Health ready" "$(curl -s $BASE/health/ready)" '"status":"ready"'

# 2. opentdb tools in catalog
check "opentdb tools in catalog (4)" \
  "$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); cnt=len([t for t in d['data'] if t['id'].startswith('opentdb.')]); print(f'opentdb_count={cnt}')")" \
  "opentdb_count=4"

# 3. Tool detail — questions has schema
check "opentdb.questions has input_schema" \
  "$(curl -s "$BASE/api/v1/tools/opentdb.questions" | python3 -c "import sys,json; t=json.load(sys.stdin); print('has_props='+str(bool(t.get('input_schema',{}).get('properties'))))")" \
  "has_props=True"

# 4. Tool detail — categories exists
check "opentdb.categories tool detail 200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/tools/opentdb.categories")" \
  "200"

# 5. Tool detail — category_count exists
check "opentdb.category_count tool detail 200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/tools/opentdb.category_count")" \
  "200"

# 6. Tool detail — global_count exists
check "opentdb.global_count tool detail 200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/tools/opentdb.global_count")" \
  "200"

# 7. Live API call (if TEST_API_KEY is set)
if [ -n "${TEST_API_KEY:-}" ]; then
  check "opentdb.categories live call" \
    "$(curl -s -X POST "$BASE/api/v1/tools/opentdb.categories/call" \
      -H "Authorization: Bearer $TEST_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{}' | python3 -c "import sys,json; r=json.load(sys.stdin); print('count='+str(r.get('result',{}).get('count','ERR')))")" \
    "count=24"

  check "opentdb.questions live call" \
    "$(curl -s -X POST "$BASE/api/v1/tools/opentdb.questions/call" \
      -H "Authorization: Bearer $TEST_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"amount":3,"difficulty":"easy"}' | python3 -c "import sys,json; r=json.load(sys.stdin); cnt=r.get('result',{}).get('count',0); print('ok' if cnt>0 else 'empty')")" \
    "ok"
else
  echo "SKIP: Live API calls require TEST_API_KEY"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && exit 0 || exit 1
