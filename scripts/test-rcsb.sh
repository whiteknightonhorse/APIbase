#!/bin/bash
# RCSB Protein Data Bank smoke tests (UC-218)
BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  if [ "$1" -eq 0 ]; then echo "  PASS: $2"; PASS=$((PASS+1)); else echo "  FAIL: $2"; FAIL=$((FAIL+1)); fi
}

echo "=== RCSB PDB Smoke Tests ==="

# 1. Health
curl -sf "$BASE/health/ready" > /dev/null
check $? "Health check"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; print(len([t for t in json.load(sys.stdin)['data'] if t['id'].startswith('pdb.')]))")
if [ "$COUNT" -eq 4 ]; then check 0 "4 PDB tools in catalog (got $COUNT)"; else check 1 "4 PDB tools in catalog (got $COUNT)"; fi

# 3. Tool details
for TOOL in pdb.search pdb.structure pdb.ligand pdb.sequence; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  if [ "$STATUS" -eq 200 ]; then check 0 "$TOOL detail ($STATUS)"; else check 1 "$TOOL detail ($STATUS)"; fi
done

# 4. Live calls (if API key set)
if [ -n "${TEST_API_KEY:-}" ]; then
  # Search
  R=$(curl -s "$BASE/api/v1/tools/pdb.search/call" -H "Authorization: Bearer $TEST_API_KEY" -H "Content-Type: application/json" -d '{"query":"hemoglobin"}')
  echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['data']['total_count'] > 0" 2>/dev/null
  check $? "pdb.search live (hemoglobin)"

  # Structure
  R=$(curl -s "$BASE/api/v1/tools/pdb.structure/call" -H "Authorization: Bearer $TEST_API_KEY" -H "Content-Type: application/json" -d '{"pdb_id":"4HHB"}')
  echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['data']['pdb_id'] == '4HHB'" 2>/dev/null
  check $? "pdb.structure live (4HHB)"

  # Ligand
  R=$(curl -s "$BASE/api/v1/tools/pdb.ligand/call" -H "Authorization: Bearer $TEST_API_KEY" -H "Content-Type: application/json" -d '{"ligand_id":"ATP"}')
  echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['data']['name'] == \"ADENOSINE-5'-TRIPHOSPHATE\"" 2>/dev/null
  check $? "pdb.ligand live (ATP)"

  # Sequence
  R=$(curl -s "$BASE/api/v1/tools/pdb.sequence/call" -H "Authorization: Bearer $TEST_API_KEY" -H "Content-Type: application/json" -d '{"sequence":"MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH"}')
  echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['data']['total_count'] > 0" 2>/dev/null
  check $? "pdb.sequence live (hemoglobin alpha)"
else
  echo "  SKIP: Set TEST_API_KEY for live API tests"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
