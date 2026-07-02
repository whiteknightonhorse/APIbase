#!/usr/bin/env bash
# Smoke test for TheSportsDB adapter (UC-586)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local cmd="$2"; local expect="$3"
  result=$(eval "$cmd" 2>/dev/null) || result=""
  if echo "$result" | grep -q "$expect"; then
    echo "  PASS  $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $label (got: ${result:0:120})"
    FAIL=$((FAIL+1))
  fi
}

echo "=== TheSportsDB Smoke Tests (UC-586) ==="

# 1. Health check
check "Health ready" \
  "curl -s $BASE/health/ready" \
  '"status":"ready"'

# 2. Tools appear in catalog
check "4 thesportsdb tools in catalog" \
  "curl -s '$BASE/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); n=sum(1 for t in d['data'] if 'thesportsdb' in t['id']); print(n)\"" \
  "^4$"

# 3. Tool detail endpoints return 200 with schema
check "team_search detail" \
  "curl -s '$BASE/api/v1/tools/thesportsdb.team_search' | python3 -c \"import sys,json; t=json.load(sys.stdin); print(t['id'])\"" \
  "thesportsdb.team_search"

check "player_search detail" \
  "curl -s '$BASE/api/v1/tools/thesportsdb.player_search' | python3 -c \"import sys,json; t=json.load(sys.stdin); print(t['id'])\"" \
  "thesportsdb.player_search"

check "events_past detail" \
  "curl -s '$BASE/api/v1/tools/thesportsdb.events_past' | python3 -c \"import sys,json; t=json.load(sys.stdin); print(t['id'])\"" \
  "thesportsdb.events_past"

check "events_next detail" \
  "curl -s '$BASE/api/v1/tools/thesportsdb.events_next' | python3 -c \"import sys,json; t=json.load(sys.stdin); print(t['id'])\"" \
  "thesportsdb.events_next"

# 4. Payment enforcement (tool call without payment → 402)
check "Payment required for team_search" \
  "curl -s -X POST '$BASE/api/v1/tools/thesportsdb.team_search/call' -H 'Content-Type: application/json' -d '{\"name\":\"Arsenal\"}'" \
  "payment_required\|UNAUTHORIZED\|api_key"

# 5. Upstream API is reachable directly
check "TheSportsDB upstream live" \
  "curl -s 'https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=Arsenal' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(len(d.get('teams',[])))\"" \
  "^[1-9]"

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ] && echo "All tests passed." || exit 1
