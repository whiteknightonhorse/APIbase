#!/usr/bin/env bash
# Smoke test for BHL (Biodiversity Heritage Library) — UC-496
set -euo pipefail

BASE="https://apibase.pro"
BHL_KEY="${PROVIDER_KEY_BHL:-27e46cb3-7e91-4168-b468-9392420c126c}"

pass=0; fail=0

check() {
  local label="$1" result="$2"
  if [ "$result" = "ok" ]; then
    echo "PASS $label"; pass=$((pass+1))
  else
    echo "FAIL $label: $result"; fail=$((fail+1))
  fi
}

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))")
check "health" "$( [ "$STATUS" = "ready" ] && echo ok || echo "health=$STATUS" )"

# 2. BHL tools appear in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['id'].startswith('bhl.')]))")
check "catalog_4_tools" "$( [ "$COUNT" = "4" ] && echo ok || echo "count=$COUNT" )"

# 3. Tool detail has input_schema
HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/bhl.literature.search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')")
check "input_schema" "$HAS_SCHEMA"

# 4. Raw BHL catalog search
RESULT=$(curl -s "https://www.biodiversitylibrary.org/api3?op=PublicationSearch&searchterm=darwin&searchtype=C&page=1&pagesize=3&format=json&apikey=${BHL_KEY}" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('Status')=='ok' and len(d.get('Result',[]))>0 else 'fail')")
check "bhl_literature_search" "$RESULT"

# 5. Raw BHL fulltext search
RESULT=$(curl -s "https://www.biodiversitylibrary.org/api3?op=PublicationSearch&searchterm=photosynthesis&searchtype=F&page=1&pagesize=3&format=json&apikey=${BHL_KEY}" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('Status')=='ok' else 'fail')")
check "bhl_literature_fulltext" "$RESULT"

# 6. Raw BHL name search
RESULT=$(curl -s "https://www.biodiversitylibrary.org/api3?op=NameSearch&name=Quercus+robur&format=json&apikey=${BHL_KEY}" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('Status')=='ok' and len(d.get('Result',[]))>0 else 'fail')")
check "bhl_taxonomy_name_search" "$RESULT"

# 7. Raw BHL subject search
RESULT=$(curl -s "https://www.biodiversitylibrary.org/api3?op=SubjectSearch&subject=ornithology&format=json&apikey=${BHL_KEY}" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('Status')=='ok' and len(d.get('Result',[]))>0 else 'fail')")
check "bhl_literature_by_subject" "$RESULT"

echo ""
echo "=== BHL smoke test: $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
