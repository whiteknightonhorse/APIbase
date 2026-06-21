#!/usr/bin/env bash
# Smoke test for Europe PMC adapter (UC-490)

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"; local expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "PASS: $desc"; PASS=$((PASS+1))
  else
    echo "FAIL: $desc — got: ${result:0:100}"; FAIL=$((FAIL+1))
  fi
}

echo "=== Europe PMC Smoke Tests (UC-490) ==="

# 1. Health
check "Health check" "$(curl -s $BASE/health/ready)" "ready"

# 2. Tool catalog shows 4 europepmc tools
TOOLS=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ep=[t['id'] for t in d['data'] if t['id'].startswith('europepmc.')]
print(len(ep))
")
check "4 europepmc tools in catalog" "$TOOLS" "4"

# 3. Tool detail — search has schema
check "europepmc.search has input_schema" \
  "$(curl -s $BASE/api/v1/tools/europepmc.search)" "query"

# 4. Tool detail — article has schema
check "europepmc.article has input_schema" \
  "$(curl -s $BASE/api/v1/tools/europepmc.article)" "id"

# 5. Tool detail — citations has schema
check "europepmc.citations has input_schema" \
  "$(curl -s $BASE/api/v1/tools/europepmc.citations)" "page_size"

# 6. Tool detail — references has schema
check "europepmc.references has input_schema" \
  "$(curl -s $BASE/api/v1/tools/europepmc.references)" "src"

# 7. Dashboard entry
check "europepmc in dashboard" \
  "$(curl -s $BASE/api/v1/dashboard | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='europepmc']; print(m[0]['tool_count'] if m else 'not found')")" "4"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || { echo "FAILURES DETECTED"; exit 1; }
