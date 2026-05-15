#!/usr/bin/env bash
# Test script for UK Food Standards Agency (FSA) — Food Hygiene Rating Scheme (UC-429)

API_BASE="https://apibase.pro"
UPSTREAM_BASE="https://api.ratings.food.gov.uk"
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== UK FSA Smoke Tests (UC-429) ==="
echo ""

# 1. Health check
echo "1/5 Health check..."
STATUS=$(curl -s "${API_BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
if [ "$STATUS" = "ready" ]; then pass "Health ready"; else fail "Health: $STATUS"; fi

# 2. Tools in catalog
echo "2/5 Tools in catalog..."
COUNT=$(curl -s "${API_BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ukfsa = [t for t in d['data'] if t['id'].startswith('ukfsa.')]
print(len(ukfsa))
")
if [ "$COUNT" = "3" ]; then pass "3 ukfsa tools visible"; else fail "Expected 3 ukfsa tools, got $COUNT"; fi

# 3. Tool detail endpoints have input_schema
echo "3/5 Tool detail endpoints..."
for TOOL in ukfsa.establishment_search ukfsa.establishment_details ukfsa.local_authorities; do
  SCHEMA=$(curl -s "${API_BASE}/api/v1/tools/${TOOL}" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
")
  if [ "$SCHEMA" = "ok" ]; then pass "${TOOL} has input_schema"; else fail "${TOOL} missing input_schema"; fi
done

# 4. Upstream API — Pret search
echo "4/5 Upstream Pret search..."
PRET_COUNT=$(curl -s -H "x-api-version: 2" "${UPSTREAM_BASE}/Establishments?name=Pret&pageSize=3" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(d['meta']['totalCount'])
")
if [ "$PRET_COUNT" -gt 100 ]; then pass "Pret search returned $PRET_COUNT businesses"; else fail "Expected >100 Pret businesses, got $PRET_COUNT"; fi

# 5. Upstream API — Authorities list
echo "5/5 Upstream Authorities list..."
AUTH_COUNT=$(curl -s -H "x-api-version: 2" "${UPSTREAM_BASE}/Authorities" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(d['meta']['totalCount'])
")
if [ "$AUTH_COUNT" -gt 300 ]; then pass "Authorities returned $AUTH_COUNT councils"; else fail "Expected >300 authorities, got $AUTH_COUNT"; fi

echo ""
echo "=== Results ==="
echo "Passed: ${PASS}/5, Failed: ${FAIL}/5"
if [ "$FAIL" -eq 0 ]; then echo "All ukfsa tests passed!"; else echo "FAILURES DETECTED"; exit 1; fi
