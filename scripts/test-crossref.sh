#!/bin/bash
# Smoke test for CrossRef — Scholarly Metadata Registry (UC-597)
# Tests: health, catalog presence, tool details, live upstream API calls

set -e
BASE="https://apibase.pro"
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

echo "=== CrossRef Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='crossref']
print(len(n))
" 2>/dev/null)
check "4 crossref tools in catalog" "$([ "$COUNT" = "4" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
for TOOL in crossref.works_search crossref.journal_lookup crossref.funder_search crossref.member_search; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
  check "$TOOL schema populated" "$HAS_SCHEMA"
done

# 4. Live upstream API calls (api.crossref.org, no auth needed)
WORKS=$(curl -s "https://api.crossref.org/works?query=test&rows=1" -H "User-Agent: APIbase/1.0 (https://apibase.pro; mailto:infocitysms@gmail.com)" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('message',{}).get('items') else 'bad_response')
" 2>/dev/null)
check "CrossRef works search API live" "$WORKS"

JOURNAL=$(curl -s "https://api.crossref.org/journals/0028-0836" -H "User-Agent: APIbase/1.0 (https://apibase.pro; mailto:infocitysms@gmail.com)" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('message',{}).get('title') else 'bad_response')
" 2>/dev/null)
check "CrossRef journal lookup API live (Nature ISSN)" "$JOURNAL"

FUNDERS=$(curl -s "https://api.crossref.org/funders?query=national+science+foundation&rows=1" -H "User-Agent: APIbase/1.0 (https://apibase.pro; mailto:infocitysms@gmail.com)" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('message',{}).get('items') else 'bad_response')
" 2>/dev/null)
check "CrossRef funder search API live" "$FUNDERS"

MEMBERS=$(curl -s "https://api.crossref.org/members?query=elsevier&rows=1" -H "User-Agent: APIbase/1.0 (https://apibase.pro; mailto:infocitysms@gmail.com)" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('message',{}).get('items') else 'bad_response')
" 2>/dev/null)
check "CrossRef member search API live" "$MEMBERS"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ] && echo "ALL PASS" || exit 1
