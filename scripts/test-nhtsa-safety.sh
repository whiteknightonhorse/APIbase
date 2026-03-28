#!/bin/bash
# NHTSA Vehicle Safety smoke tests (UC-219)
BASE="https://apibase.pro"
PASS=0; FAIL=0
check() { if [ "$1" -eq 0 ]; then echo "  PASS: $2"; PASS=$((PASS+1)); else echo "  FAIL: $2"; FAIL=$((FAIL+1)); fi; }

echo "=== NHTSA Safety Smoke Tests ==="

curl -sf "$BASE/health/ready" > /dev/null; check $? "Health check"

COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; print(len([t for t in json.load(sys.stdin)['data'] if t['id'].startswith('safety.')]))")
if [ "$COUNT" -eq 4 ]; then check 0 "4 safety tools in catalog (got $COUNT)"; else check 1 "4 safety tools in catalog (got $COUNT)"; fi

for TOOL in safety.recalls safety.complaints safety.ratings safety.investigations; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  if [ "$STATUS" -eq 200 ]; then check 0 "$TOOL detail ($STATUS)"; else check 1 "$TOOL detail ($STATUS)"; fi
done

if [ -n "${TEST_API_KEY:-}" ]; then
  R=$(curl -s "$BASE/api/v1/tools/safety.recalls/call" -H "Authorization: Bearer $TEST_API_KEY" -H "Content-Type: application/json" -d '{"make":"Toyota","model":"Camry","model_year":2020}')
  echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['data']['count'] > 0" 2>/dev/null
  check $? "safety.recalls live (Toyota Camry 2020)"

  R=$(curl -s "$BASE/api/v1/tools/safety.complaints/call" -H "Authorization: Bearer $TEST_API_KEY" -H "Content-Type: application/json" -d '{"make":"Tesla","model":"Model 3","model_year":2023}')
  echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['data']['count'] > 0" 2>/dev/null
  check $? "safety.complaints live (Tesla Model 3)"

  R=$(curl -s "$BASE/api/v1/tools/safety.ratings/call" -H "Authorization: Bearer $TEST_API_KEY" -H "Content-Type: application/json" -d '{"make":"toyota","model":"camry","model_year":2023}')
  echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['data']['count'] > 0" 2>/dev/null
  check $? "safety.ratings live (Camry 2023)"

  R=$(curl -s "$BASE/api/v1/tools/safety.investigations/call" -H "Authorization: Bearer $TEST_API_KEY" -H "Content-Type: application/json" -d '{"make":"Tesla"}')
  echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['data']['count'] > 0" 2>/dev/null
  check $? "safety.investigations live (Tesla)"
else
  echo "  SKIP: Set TEST_API_KEY for live API tests"
fi

echo ""; echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
