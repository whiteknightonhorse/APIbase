#!/usr/bin/env bash
# Smoke test for HuggingFace Inference NLP (UC-547)
set -e

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1" result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc — $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== HuggingFace Inference NLP smoke test (UC-547) ==="

# 1. Health
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/health/ready")
[ "$STATUS" = "200" ] && check "Health check" "ok" || check "Health check" "HTTP $STATUS"

# 2. Tools in catalog
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('hf_inference.')))")
[ "$COUNT" = "5" ] && check "5 hf_inference tools in catalog" "ok" || check "5 hf_inference tools in catalog" "got $COUNT"

# 3. Tool detail endpoints
for TOOL in sentiment ner zero_shot translate summarize; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/v1/tools/hf_inference.${TOOL}")
  [ "$STATUS" = "200" ] && check "Tool detail: hf_inference.${TOOL}" "ok" || check "Tool detail: hf_inference.${TOOL}" "HTTP $STATUS"
done

# 4. Schema check (input_schema has properties)
PROPS=$(curl -s "${BASE}/api/v1/tools/hf_inference.sentiment" | python3 -c "import sys,json; t=json.load(sys.stdin); print(len(t.get('input_schema',{}).get('properties',{})))")
[ "$PROPS" -ge "1" ] && check "Sentiment schema has properties" "ok" || check "Sentiment schema has properties" "got $PROPS"

echo ""
echo "=== Results: PASS=${PASS} FAIL=${FAIL} ==="
[ "$FAIL" = "0" ] && echo "ALL PASS" || exit 1
