#!/usr/bin/env bash
# Smoke test for NIH Reporter (UC-454)
# Tests: health check, catalog, tool details, live upstream calls

set -uo pipefail
BASE="https://apibase.pro"
PASS=0; FAIL=0

ok() { echo "  PASS $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL $1: $2"; FAIL=$((FAIL+1)); }

echo "=== NIH Reporter Smoke Tests (UC-454) ==="

# 1. Health check
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))")
[ "$STATUS" = "ready" ] && ok "Health check" || fail "Health" "status=$STATUS"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['id'].startswith('nihreporter.')]))")
[ "$COUNT" -eq 4 ] && ok "4 nihreporter tools in catalog" || fail "nihreporter tools count" "expected 4, got $COUNT"

# 3. Tool detail — schema present
for TOOL in nihreporter.projects.search nihreporter.projects.by_org nihreporter.projects.by_pi nihreporter.publications.by_project; do
  SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'fail')")
  [ "$SCHEMA" = "ok" ] && ok "$TOOL schema" || fail "$TOOL schema" "no properties in input_schema"
done

# 4. Live upstream calls (direct, no auth required)
TOTAL=$(curl -s -X POST "https://api.reporter.nih.gov/v2/projects/search" \
  -H "Content-Type: application/json" \
  -d '{"criteria":{"advanced_text_search":{"operator":"and","search_field":"all","search_text":"diabetes"},"fiscal_years":[2024]},"offset":0,"limit":2}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('meta',{}).get('total',0))")
[ "$TOTAL" -gt 0 ] && ok "Upstream projects search (total=$TOTAL)" || fail "Upstream projects search" "total=0"

ORG_TOTAL=$(curl -s -X POST "https://api.reporter.nih.gov/v2/projects/search" \
  -H "Content-Type: application/json" \
  -d '{"criteria":{"org_names":["MAYO CLINIC"],"fiscal_years":[2024]},"offset":0,"limit":2}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('meta',{}).get('total',0))")
[ "$ORG_TOTAL" -gt 0 ] && ok "Upstream by_org (MAYO CLINIC, total=$ORG_TOTAL)" || fail "Upstream by_org" "total=0"

PUB_TOTAL=$(curl -s -X POST "https://api.reporter.nih.gov/v2/publications/search" \
  -H "Content-Type: application/json" \
  -d '{"criteria":{"core_project_nums":["U54GM115371"]},"offset":0,"limit":5}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('meta',{}).get('total',0))")
[ "$PUB_TOTAL" -gt 0 ] && ok "Upstream publications.by_project (total=$PUB_TOTAL)" || fail "Upstream publications" "total=0"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "=== ALL TESTS PASSED ===" && exit 0 || exit 1
