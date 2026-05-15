#!/usr/bin/env bash
# Smoke test for Chess.com Public Data API adapter (UC-417)
set -euo pipefail

BASE="https://apibase.pro"
UPSTREAM="https://api.chess.com"
UA="APIbase-Gateway/1.0 (https://apibase.pro)"
PASS=0; FAIL=0

ok()   { echo "  [PASS] $1"; PASS=$((PASS+1)); }
fail() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }

echo "=== Chess.com Smoke Tests ==="

# 1. Health check
echo ""
echo "1. Health check"
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
[ "$STATUS" = "ready" ] && ok "Health ready" || fail "Health check failed"

# 2. Tools in catalog
echo ""
echo "2. Provider tools in catalog"
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
cc=[t for t in d['data'] if t['id'].startswith('chesscom.')]
print(len(cc))
" 2>/dev/null)
[ "$COUNT" -ge 3 ] && ok "${COUNT} chesscom tools in catalog" || fail "Expected >=3 chesscom tools, got ${COUNT}"

# 3. Tool detail endpoints
echo ""
echo "3. Tool detail endpoints (200 + input_schema)"
for TOOL in chesscom.player_profile chesscom.player_stats chesscom.titled_players; do
  RESP=$(curl -s "${BASE}/api/v1/tools/${TOOL}")
  HAS=$(echo "$RESP" | python3 -c "import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))" 2>/dev/null)
  [ "$HAS" = "True" ] && ok "${TOOL} has input_schema" || fail "${TOOL} missing input_schema"
done

# 4. Upstream API verification (direct, no payment)
echo ""
echo "4. Upstream API curl verification"
PROFILE=$(curl -s -H "User-Agent: ${UA}" "${UPSTREAM}/pub/player/hikaru")
USERNAME=$(echo "$PROFILE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('username',''))" 2>/dev/null)
[ "$USERNAME" = "hikaru" ] && ok "Hikaru profile: username=${USERNAME}" || fail "Profile username mismatch"

TITLE=$(echo "$PROFILE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('title',''))" 2>/dev/null)
[ "$TITLE" = "GM" ] && ok "Hikaru title: ${TITLE}" || fail "Hikaru not a GM"

STATS=$(curl -s -H "User-Agent: ${UA}" "${UPSTREAM}/pub/player/hikaru/stats")
HAS_BLITZ=$(echo "$STATS" | python3 -c "import sys,json; print('chess_blitz' in json.load(sys.stdin))" 2>/dev/null)
[ "$HAS_BLITZ" = "True" ] && ok "Hikaru stats has chess_blitz" || fail "Missing chess_blitz in stats"

GM_COUNT=$(curl -s -H "User-Agent: ${UA}" "${UPSTREAM}/pub/titled/GM" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['players']))" 2>/dev/null)
[ "$GM_COUNT" -gt 1000 ] && ok "GM list count: ${GM_COUNT}" || fail "GM list too short: ${GM_COUNT}"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
