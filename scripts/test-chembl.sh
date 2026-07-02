#!/usr/bin/env bash
# Smoke test for ChEMBL adapter (UC-579)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc — $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== ChEMBL Smoke Tests (UC-579) ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
check "health/ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "status=$STATUS")"

# 2. ChEMBL tools in catalog
CHEMBL_COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t['id'].startswith('chembl.')))
" 2>/dev/null)
check "4 chembl tools in catalog" "$([ "$CHEMBL_COUNT" = "4" ] && echo ok || echo "found=$CHEMBL_COUNT")"

# 3. Tool detail endpoints
for TOOL in chembl.molecule_search chembl.molecule_detail chembl.target_search chembl.bioactivity; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  check "GET /api/v1/tools/$TOOL = 200" "$([ "$HTTP" = "200" ] && echo ok || echo "http=$HTTP")"
done

# 4. Schema properties present
PROPS=$(curl -s "$BASE/api/v1/tools/chembl.molecule_search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props = list(t.get('input_schema',{}).get('properties',{}).keys())
print('ok' if 'query' in props and 'max_phase' in props else 'missing=' + str(props))
" 2>/dev/null)
check "molecule_search schema has query+max_phase" "$PROPS"

PROPS2=$(curl -s "$BASE/api/v1/tools/chembl.bioactivity" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props = list(t.get('input_schema',{}).get('properties',{}).keys())
print('ok' if 'molecule_chembl_id' in props and 'target_chembl_id' in props else 'missing=' + str(props))
" 2>/dev/null)
check "bioactivity schema has molecule_chembl_id+target_chembl_id" "$PROPS2"

# 5. Live ChEMBL API reachability
CHEMBL_LIVE=$(curl -sL "https://www.ebi.ac.uk/chembl/api/data/molecule/CHEMBL25?format=json" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('pref_name') == 'ASPIRIN' else 'name=' + str(d.get('pref_name')))
" 2>/dev/null)
check "ChEMBL upstream: CHEMBL25=ASPIRIN" "$CHEMBL_LIVE"

# 6. Live target search
TARGET_LIVE=$(curl -sL "https://www.ebi.ac.uk/chembl/api/data/target?format=json&pref_name__icontains=Acetylcholinesterase&limit=1" | python3 -c "
import sys,json; d=json.load(sys.stdin)
targets = d.get('targets', [])
print('ok' if targets and targets[0].get('target_chembl_id') else 'empty')
" 2>/dev/null)
check "ChEMBL upstream: target search works" "$TARGET_LIVE"

# 7. Dashboard entry
DASH=$(curl -s "$BASE/api/v1/dashboard" | python3 -c "
import sys,json; d=json.load(sys.stdin)
match = [p for p in d['providers'] if p['provider'] == 'chembl']
print('ok' if match and match[0]['tool_count'] == 4 else 'not_found_or_wrong_count')
" 2>/dev/null)
check "chembl in dashboard with 4 tools" "$DASH"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ] && echo "STATUS: ALL PASS" || echo "STATUS: FAILURES DETECTED"
exit $FAIL
