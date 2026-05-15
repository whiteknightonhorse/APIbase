#!/usr/bin/env bash
# Lichess adapter smoke test (UC-416)
# Tests: health, catalog presence, tool detail, upstream API

set -euo pipefail
BASE="https://apibase.pro"
LICHESS_BASE="https://lichess.org"

echo "=== Lichess Smoke Test (UC-416) ==="

# 1. Health check
echo -n "1/5 Health check... "
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "PASS" || { echo "FAIL: $STATUS"; exit 1; }

# 2. Lichess tools in catalog
echo -n "2/5 Lichess tools in catalog... "
COUNT=$(curl -s "$BASE/api/v1/tools?search=lichess" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([t for t in d['data'] if t['id'].startswith('lichess.')]))")
[ "$COUNT" -eq 3 ] && echo "PASS ($COUNT tools)" || { echo "FAIL: expected 3, got $COUNT"; exit 1; }

# 3. Tool detail endpoints
echo -n "3/5 Tool detail endpoints (200)... "
for TOOL in lichess.user_profile lichess.top_players lichess.daily_puzzle; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  [ "$HTTP" = "200" ] || { echo "FAIL: $TOOL returned $HTTP"; exit 1; }
done
echo "PASS"

# 4. Upstream: daily puzzle
echo -n "4/5 Upstream daily puzzle... "
PUZZLE=$(curl -s "$LICHESS_BASE/api/puzzle/daily" -H "User-Agent: APIbase-Gateway/1.0 (https://apibase.pro)" -H "Accept: application/json")
HAS_PUZZLE=$(echo "$PUZZLE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('puzzle') else 'missing')" 2>/dev/null || echo "parse_error")
[ "$HAS_PUZZLE" = "ok" ] && echo "PASS" || { echo "FAIL: $HAS_PUZZLE"; exit 1; }

# 5. Upstream: top 5 blitz players
echo -n "5/5 Upstream top blitz players... "
TOP=$(curl -s "$LICHESS_BASE/api/player/top/5/blitz" -H "User-Agent: APIbase-Gateway/1.0 (https://apibase.pro)" -H "Accept: application/json")
COUNT_USERS=$(echo "$TOP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('users', [])))" 2>/dev/null || echo "0")
[ "$COUNT_USERS" -eq 5 ] && echo "PASS ($COUNT_USERS users)" || { echo "FAIL: expected 5 users, got $COUNT_USERS"; exit 1; }

echo ""
echo "=== All 5 Lichess tests passed ==="
