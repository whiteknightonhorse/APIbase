#!/bin/bash
# PokéAPI smoke test (UC-518)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
PASS=0; FAIL=0

ok() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== PokéAPI (UC-518) Smoke Test ==="
echo "Target: $API_URL"
echo ""

# 1. Health
echo -n "1. Health check..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/ready")
[ "$CODE" = "200" ] && ok "200" || fail "got $CODE"

# 2. Tools in catalog
echo -n "2. PokeAPI tools in catalog..."
COUNT=$(curl -s "$API_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('pokeapi.')))")
[ "$COUNT" = "4" ] && ok "4 tools found" || fail "expected 4, got $COUNT"

# 3. Tool detail - pokemon
echo -n "3. Tool detail pokeapi.pokemon..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/pokeapi.pokemon")
[ "$CODE" = "200" ] && ok "200" || fail "got $CODE"

# 4. Tool detail - species
echo -n "4. Tool detail pokeapi.species..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/pokeapi.species")
[ "$CODE" = "200" ] && ok "200" || fail "got $CODE"

# 5. Tool detail - move
echo -n "5. Tool detail pokeapi.move..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/pokeapi.move")
[ "$CODE" = "200" ] && ok "200" || fail "got $CODE"

# 6. Tool detail - type
echo -n "6. Tool detail pokeapi.type..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/pokeapi.type")
[ "$CODE" = "200" ] && ok "200" || fail "got $CODE"

# 7. Schema populated
echo -n "7. Input schema has properties..."
PROPS=$(curl -s "$API_URL/api/v1/tools/pokeapi.pokemon" | python3 -c "import sys,json; t=json.load(sys.stdin); print(list(t['input_schema']['properties'].keys()))")
[ "$PROPS" = "['name_or_id']" ] && ok "['name_or_id']" || fail "got $PROPS"

# 8. Payment required (pipeline working) — uses SMOKE_TEST_KEY for auth, expects 402
echo -n "8. Payment enforcement (x402 challenge)..."
SMOKE_KEY="${SMOKE_TEST_KEY:-$(grep SMOKE_TEST_KEY .env 2>/dev/null | cut -d= -f2-)}"
if [ -n "$SMOKE_KEY" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/v1/tools/pokeapi.pokemon/call" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SMOKE_KEY" \
    -d '{"name_or_id":"pikachu"}')
  [ "$CODE" = "402" ] && ok "402 payment required (authenticated)" || fail "expected 402, got $CODE"
else
  echo "  SKIP: no SMOKE_TEST_KEY available"
fi

# 9. Direct upstream verification
echo -n "9. Upstream API reachable..."
DATA=$(curl -s "https://pokeapi.co/api/v2/pokemon/pikachu" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['name'])")
[ "$DATA" = "pikachu" ] && ok "pikachu" || fail "got $DATA"

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" = "0" ] && echo "ALL PASS" || exit 1
