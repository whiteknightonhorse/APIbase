#!/bin/bash
# Smoke test for PLOS Search API — open-access article search + detail (UC-609)
# Tests: health, catalog presence, tool details, live upstream API calls

set -e
BASE="${BASE:-https://apibase.pro}"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc — $result"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== PLOS Search API Smoke Test ==="
echo "Target: $BASE"

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='plos-search']
print(len(n))
" 2>/dev/null)
check "2 plos-search tools in catalog" "$([ "$COUNT" = "2" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
for TOOL in plos-search.search plos-search.article_detail; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
  check "$TOOL schema populated" "$HAS_SCHEMA"
done

# 4. Live upstream API calls (api.plos.org, no auth needed)
SEARCH_OK=$(curl -s "https://api.plos.org/search?q=malaria&rows=2&fl=id,title" | python3 -c "
import sys,json
d=json.load(sys.stdin)
docs=d.get('response',{}).get('docs',[])
print('ok' if d.get('response',{}).get('numFound',0) > 0 and len(docs) > 0 else 'no results')
" 2>/dev/null)
check "Live: article search" "$SEARCH_OK"

DETAIL_OK=$(curl -s 'https://api.plos.org/search?q=id:%2210.1371/journal.pone.0004050%22&fl=id,title&rows=1' | python3 -c "
import sys,json
d=json.load(sys.stdin)
docs=d.get('response',{}).get('docs',[])
print('ok' if len(docs) == 1 and docs[0].get('id') == '10.1371/journal.pone.0004050' else 'unexpected shape')
" 2>/dev/null)
check "Live: article detail by DOI" "$DETAIL_OK"

JOURNAL_FILTER_OK=$(curl -s 'https://api.plos.org/search?q=malaria&fq=journal:%22PLOS%20ONE%22&rows=1&fl=id,journal' | python3 -c "
import sys,json
d=json.load(sys.stdin)
docs=d.get('response',{}).get('docs',[])
print('ok' if len(docs) == 1 and docs[0].get('journal','').upper() == 'PLOS ONE' else 'unexpected shape')
" 2>/dev/null)
check "Live: journal filter" "$JOURNAL_FILTER_OK"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
