#!/usr/bin/env bash
# Smoke test for Victoria and Albert Museum (VAM) integration — UC-499
set -e

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local cmd="$2"; local expect="$3"
  local out
  out=$(eval "$cmd" 2>&1) || true
  if echo "$out" | grep -q "$expect"; then
    echo "PASS: $label"; PASS=$((PASS+1))
  else
    echo "FAIL: $label (expected '$expect', got: ${out:0:200})"; FAIL=$((FAIL+1))
  fi
}

echo "=== VAM (UC-499) Smoke Tests ==="

# 1. Health
check "Health ready" \
  "curl -s $BASE/health/ready" \
  '"status":"ready"'

# 2. Tool catalog includes VAM tools
check "VAM tools in catalog" \
  "curl -s '$BASE/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); vam=[t for t in d['data'] if t['id'].startswith('vam.')]; print(len(vam))\"" \
  "4"

# 3. vam.search tool detail
check "vam.search detail (schema)" \
  "curl -s '$BASE/api/v1/tools/vam.search'" \
  '"query"'

# 4. vam.object tool detail
check "vam.object detail (schema)" \
  "curl -s '$BASE/api/v1/tools/vam.object'" \
  '"system_number"'

# 5. vam.by_maker tool detail
check "vam.by_maker detail (schema)" \
  "curl -s '$BASE/api/v1/tools/vam.by_maker'" \
  '"maker"'

# 6. vam.by_category tool detail
check "vam.by_category detail (schema)" \
  "curl -s '$BASE/api/v1/tools/vam.by_category'" \
  '"category_id"'

# 7. Direct API sanity check (upstream live)
check "VAM API live (upstream)" \
  "curl -s 'https://api.vam.ac.uk/v2/objects/search?q=vase&page_size=1'" \
  '"record_count"'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || exit 1
