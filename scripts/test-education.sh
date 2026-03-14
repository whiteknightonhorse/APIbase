#!/usr/bin/env bash
# UC-017 Education / Academic Research — Pipeline API tests
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
    yellow "SKIP: $name (HTTP 502 — provider unavailable)"
    SKIP=$((SKIP + 1))
  else
    red "FAIL: $name (HTTP $status)"
    echo "$body" | head -c 300
    echo
    FAIL=$((FAIL + 1))
  fi
}

echo "=== UC-017 Education / Academic Research Tests ==="
echo ""

# --- 1. OpenAlex Paper Search (no auth, polite pool) ---
echo "1/7 OpenAlex paper_search..."
RESP=$(call_tool "education.paper_search" '{"query": "machine learning", "limit": 3}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "OpenAlex paper_search" "$STATUS" "$BODY" "'results' in d.get('data',{}) or 'meta' in d.get('data',{})"

# --- 2. OpenAlex Paper Details (no auth) ---
echo "2/7 OpenAlex paper_details..."
RESP=$(call_tool "education.paper_details" '{"id": "W2741809807"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "OpenAlex paper_details" "$STATUS" "$BODY" "'id' in d.get('data',{}) and 'title' in d.get('data',{})"

# --- 3. College Scorecard Search (DEMO_KEY) ---
echo "3/7 College Scorecard college_search..."
RESP=$(call_tool "education.college_search" '{"name": "MIT", "limit": 3}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "College Scorecard college_search" "$STATUS" "$BODY" "'results' in d.get('data',{})"

# --- 4. College Scorecard Details (DEMO_KEY) ---
echo "4/7 College Scorecard college_details..."
RESP=$(call_tool "education.college_details" '{"school_id": 166027}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "College Scorecard college_details" "$STATUS" "$BODY" "'school.name' in d.get('data',{}) or 'id' in d.get('data',{})"

# --- 5. PubMed Search (no auth needed) ---
echo "5/7 PubMed pubmed_search..."
RESP=$(call_tool "education.pubmed_search" '{"query": "CRISPR gene editing", "limit": 5}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "PubMed pubmed_search" "$STATUS" "$BODY" "'esearchresult' in d.get('data',{}) or 'result' in d.get('data',{})"

# --- 6. arXiv Search (no auth needed) ---
echo "6/7 arXiv arxiv_search..."
RESP=$(call_tool "education.arxiv_search" '{"query": "transformer architecture", "category": "cs.AI", "limit": 3}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "arXiv arxiv_search" "$STATUS" "$BODY" "'entries' in d.get('data',{})"

# --- 7. CrossRef DOI Lookup (no auth needed) ---
echo "7/7 CrossRef doi_lookup..."
RESP=$(call_tool "education.doi_lookup" '{"doi": "10.1038/nature12373"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "CrossRef doi_lookup" "$STATUS" "$BODY" "'DOI' in d.get('data',{})"

echo ""
echo "=== Results: $PASS PASS, $SKIP SKIP, $FAIL FAIL ==="
[ "$FAIL" -eq 0 ] && green "ALL OK (${PASS} working, ${SKIP} skipped)" || red "SOME FAILED"
exit "$FAIL"
