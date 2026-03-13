#!/usr/bin/env bash
# UC-015 Jobs / Career Intelligence — Pipeline API tests
set -euo pipefail

PASS=0
FAIL=0
SKIP=0
BASE="https://apibase.pro"
API_KEY="${TEST_API_KEY:-ak_live_00000000000000000000000000000000}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$1"; }

call_tool() {
  local tool="$1" body="$2"
  curl -s -w "\n%{http_code}" "$BASE/api/v1/tools/$tool/call" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "$body"
}

check() {
  local name="$1" status="$2" body="$3" field="$4"
  if [ "$status" -eq 200 ] && echo "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); assert $field" 2>/dev/null; then
    green "PASS: $name (HTTP $status)"
    PASS=$((PASS + 1))
  elif [ "$status" -eq 502 ]; then
    yellow "SKIP: $name (HTTP 502 — provider key not configured)"
    SKIP=$((SKIP + 1))
  else
    red "FAIL: $name (HTTP $status)"
    echo "$body" | head -c 300
    echo
    FAIL=$((FAIL + 1))
  fi
}

echo "=== UC-015 Jobs / Career Intelligence Tests ==="
echo ""

# --- 1. BLS Salary Data (no key needed, public tier) ---
echo "1/6 BLS salary_data..."
RESP=$(call_tool "jobs.salary_data" '{"series_ids": ["CES0000000001"], "start_year": "2024", "end_year": "2025"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "BLS salary_data" "$STATUS" "$BODY" "'Results' in d.get('data',{})"

# --- 2. O*NET Occupation Search (needs PROVIDER_KEY_ONET) ---
echo "2/6 O*NET occupation_search..."
RESP=$(call_tool "jobs.occupation_search" '{"keyword": "software"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "O*NET occupation_search" "$STATUS" "$BODY" "'occupation' in d.get('data',{})"

# --- 3. O*NET Occupation Details (needs PROVIDER_KEY_ONET) ---
echo "3/6 O*NET occupation_details..."
RESP=$(call_tool "jobs.occupation_details" '{"code": "15-1252.00", "section": "skills"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "O*NET occupation_details" "$STATUS" "$BODY" "'element' in d.get('data',{})"

# --- 4. ESCO Skills Search (no auth needed) ---
echo "4/6 ESCO esco_search..."
RESP=$(call_tool "jobs.esco_search" '{"text": "software developer", "type": "occupation", "limit": 5}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "ESCO esco_search" "$STATUS" "$BODY" "'_embedded' in d.get('data',{})"

# --- 5. ESCO Details (no auth needed) ---
echo "5/6 ESCO esco_details..."
RESP=$(call_tool "jobs.esco_details" '{"uri": "http://data.europa.eu/esco/occupation/f2b15a0e-e65a-438a-affb-29b9d50b77d1", "type": "occupation"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "ESCO esco_details" "$STATUS" "$BODY" "'uri' in d.get('data',{}) and 'title' in d.get('data',{})"

# --- 6. CareerJet Job Search (needs PROVIDER_KEY_CAREERJET) ---
echo "6/6 CareerJet job_search..."
RESP=$(call_tool "jobs.job_search" '{"keywords": "software developer", "location": "New York"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "CareerJet job_search" "$STATUS" "$BODY" "'jobs' in d.get('data',{})"

echo ""
echo "=== Results: $PASS PASS, $SKIP SKIP (no key), $FAIL FAIL ==="
[ "$FAIL" -eq 0 ] && green "ALL OK (${PASS} working, ${SKIP} pending keys)" || red "SOME FAILED"
exit "$FAIL"
