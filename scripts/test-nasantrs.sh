#!/usr/bin/env bash
# Smoke test for NASA Technical Reports Server (NTRS) — UC-474
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"
  if [ "$result" = "OK" ]; then
    echo "  PASS: $label"; PASS=$((PASS+1))
  else
    echo "  FAIL: $label — $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== NASA Technical Reports Server (NTRS) smoke tests ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print('OK' if json.load(sys.stdin).get('status')=='ready' else 'FAIL')")
check "Health ready" "$STATUS"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ntrs=[t for t in d['data'] if t['id'].startswith('nasantrs.')]
print('OK' if len(ntrs)==4 else f'FAIL: expected 4, got {len(ntrs)}')")
check "4 NTRS tools in catalog" "$COUNT"

# 3. Tool detail schema
SCHEMA=$(curl -s "$BASE/api/v1/tools/nasantrs.search" | python3 -c "
import sys,json
t=json.load(sys.stdin)
has_s=bool(t.get('input_schema',{}).get('properties'))
has_d=t.get('description','')!=t.get('name','')
print('OK' if has_s and has_d else f'FAIL: schema={has_s} desc={has_d}')")
check "nasantrs.search schema+description" "$SCHEMA"

SCHEMA2=$(curl -s "$BASE/api/v1/tools/nasantrs.report" | python3 -c "
import sys,json
t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print('OK' if 'report_id' in props else f'FAIL: missing report_id in {list(props.keys())}')")
check "nasantrs.report has report_id param" "$SCHEMA2"

# 4. Upstream NTRS API alive
UPSTREAM=$(curl -s "https://ntrs.nasa.gov/api/citations/search?q=propulsion&limit=1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('OK' if d.get('stats',{}).get('total',0)>0 else 'FAIL: no results')")
check "Upstream NTRS API alive" "$UPSTREAM"

# 5. Upstream citation by ID
CITE=$(curl -s "https://ntrs.nasa.gov/api/citations/20140017767" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('OK' if d.get('id')==20140017767 else 'FAIL')")
check "Upstream citation lookup by ID" "$CITE"

# 6. Dashboard
DASH=$(curl -s "$BASE/api/v1/dashboard" | python3 -c "
import sys,json
d=json.load(sys.stdin)
m=[p for p in d['providers'] if p['provider']=='nasantrs']
print('OK' if m else 'FAIL: nasantrs not in dashboard')")
check "Dashboard shows nasantrs" "$DASH"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && echo "All NTRS tests passed." || exit 1
