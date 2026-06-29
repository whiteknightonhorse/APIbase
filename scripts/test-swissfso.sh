#!/usr/bin/env bash
# Smoke test for Swiss FSO (UC-526) — PxWeb STAT-TAB adapter
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"
  if [[ "$result" == "ok" ]]; then
    echo "PASS: $label"; ((PASS++))
  else
    echo "FAIL: $label — $result"; ((FAIL++))
  fi
}

echo "=== Swiss FSO (UC-526) Smoke Tests ==="
echo ""

# 1. Health check
status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/health/ready")
check "Health check" "$([[ $status == 200 ]] && echo ok || echo "HTTP $status")"

# 2. swissfso tools in catalog
count=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
tools=[t for t in d['data'] if t['id'].startswith('swissfso.')]
print(len(tools))
")
check "swissfso tools in catalog (expect 4)" "$([[ $count -eq 4 ]] && echo ok || echo "got $count")"

# 3. Tool detail — schema check
schema=$(curl -s "${BASE}/api/v1/tools/swissfso.catalog.list" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print('ok' if props else 'no-schema')
")
check "swissfso.catalog.list input_schema" "$schema"

schema2=$(curl -s "${BASE}/api/v1/tools/swissfso.table.query" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print('ok' if 'database_id' in props else 'missing-database_id')
")
check "swissfso.table.query has database_id param" "$schema2"

# 4. Upstream API reachability — catalog root
up=$(curl -s -o /dev/null -w "%{http_code}" "https://www.pxweb.bfs.admin.ch/api/v1/de")
check "FSO API root reachable (German)" "$([[ $up == 200 ]] && echo ok || echo "HTTP $up")"

# 5. Upstream API — database navigation
nav=$(curl -s "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0304010000_201" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok' if isinstance(d, list) and len(d)==1 and d[0]['id']=='px-x-0304010000_201.px' else 'fail')
")
check "FSO wages DB navigation (de)" "$nav"

# 6. Upstream API — table metadata
meta=$(curl -s "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0304010000_201/px-x-0304010000_201.px" | python3 -c "
import sys,json
d=json.load(sys.stdin)
has_title = bool(d.get('title'))
has_vars = len(d.get('variables', [])) == 6
print('ok' if has_title and has_vars else f'fail:title={has_title},vars={len(d.get(\"variables\",[]))}')
")
check "FSO wages DB metadata (6 variables)" "$meta"

# 7. Upstream API — live wages query (2024 median)
wage=$(curl -s -X POST "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0304010000_201/px-x-0304010000_201.px" \
  -H "Content-Type: application/json" \
  -d '{"query":[
    {"code":"Jahr","selection":{"filter":"item","values":["2024"]}},
    {"code":"Grossregion","selection":{"filter":"item","values":["-1"]}},
    {"code":"Wirtschaftsabteilung","selection":{"filter":"item","values":["-1"]}},
    {"code":"Berufliche Stellung","selection":{"filter":"item","values":["-1"]}},
    {"code":"Geschlecht","selection":{"filter":"item","values":["-1"]}},
    {"code":"Zentralwert und andere Perzentile","selection":{"filter":"item","values":["1"]}}
  ],"response":{"format":"json-stat2"}}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
val=d.get('value',[None])[0]
print('ok' if isinstance(val,(int,float)) and val>4000 else f'unexpected-value:{val}')
")
check "FSO wages query (2024 median >4000 CHF)" "$wage"

# 8. Upstream API — population query
pop=$(curl -s -X POST "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0103010000_123/px-x-0103010000_123.px" \
  -H "Content-Type: application/json" \
  -d '{"query":[
    {"code":"Kanton","selection":{"filter":"item","values":["8100"]}},
    {"code":"Bevölkerungstyp","selection":{"filter":"item","values":["1"]}},
    {"code":"Anwesenheitsbewilligung","selection":{"filter":"item","values":["-99999"]}},
    {"code":"Staatsangehörigkeit","selection":{"filter":"item","values":["-99999"]}},
    {"code":"Geschlecht","selection":{"filter":"item","values":["-99999"]}},
    {"code":"Alter","selection":{"filter":"item","values":["-99999"]}}
  ],"response":{"format":"json-stat2"}}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
val=d.get('value',[None])[0]
print('ok' if isinstance(val,(int,float)) and val>8000000 else f'unexpected:{val}')
")
check "FSO population query (CH 2023 >8M)" "$pop"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
