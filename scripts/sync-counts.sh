#!/usr/bin/env bash
# sync-counts.sh — propagate the LIVE healthy tool/provider counts to EVERY public surface.
# Source of truth: DB tools WHERE status != 'unavailable' (== what the live MCP /api/v1/tools
# and tools/list actually serve — see src/services/tool-registry.service.ts).
# Idempotent + safe: only rewrites known catalog-count phrases.
# MANDATORY after every onboarding batch (onboard-provider skill Step 12/12.5 + orchestra push-batch).
# A-11 (2026-08-24): added ai.txt "Tools: N across" phrasing, api-catalog title counts, and
# server-card.json regeneration to this gate. The final verification is now fatal (exit 1) —
# a stale count that survives the rewrite pass must fail the build, not print a warning nobody reads.
# C-02 (2026-08-24): added --check mode. Default (no flag) is the cron self-heal behavior —
# rewrite every surface, then verify. `--check` is read-only: no file is written (no sed, no
# gen-card.ts regen, no GitHub About edit), it only compares current on-disk surfaces against the
# live DB count and fails (exit 1) on any drift. Gates/CI must use --check — self-heal mode always
# exits 0 by construction (it fixes drift before verifying it), so it can never catch a regression.
set -euo pipefail
ROOT="${ROOT:-/home/apibase/apibase}"; cd "$ROOT"

CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

COUNTS=$(docker exec apibase-postgres-1 psql -U apibase -d apibase -tAc \
  "select count(*)||' '||count(distinct provider) from tools where status != 'unavailable'")
TOOLS=$(echo "$COUNTS" | awk '{print $1}'); PROV=$(echo "$COUNTS" | awk '{print $2}')
[ -n "$TOOLS" ] && [ -n "$PROV" ] || { echo "sync-counts: failed to read counts"; exit 1; }
echo "sync-counts: live active (status != unavailable) = $TOOLS tools / $PROV providers"

CATALOG="static/.well-known/api-catalog"
CHANGED=0
if [ "$CHECK" = "1" ]; then
  echo "sync-counts: --check mode — read-only, no file will be written"
else
  for f in static/index.html static/terms.html static/frameworks.html static/contact.html \
           static/privacy.html static/dashboard.html static/llms.txt static/ai.txt README.md; do
    [ -f "$f" ] || continue
    b=$(md5sum "$f" | cut -d" " -f1)
    sed -i -E "s/[0-9]{3,}\+?( [A-Za-z]+)? tools/${TOOLS} tools/g; s/[0-9]{3,}\+?( [A-Za-z]+)? providers/${PROV} providers/g; s/Tools: [0-9]{3,} across/Tools: ${TOOLS} across/g" "$f"
    [ "$(md5sum "$f" | cut -d" " -f1)" != "$b" ] && { echo "  updated $f"; CHANGED=$((CHANGED+1)); }
  done

  # api-catalog (RFC 9727 linkset, no file extension so not caught by the glob above) has two
  # hand-written prose titles that reference the tool count in a phrasing the generic patterns
  # above don't match ("N tool endpoints" / "N tool definitions").
  if [ -f "$CATALOG" ]; then
    b=$(md5sum "$CATALOG" | cut -d" " -f1)
    sed -i -E "s/[0-9]{3,} tool endpoints/${TOOLS} tool endpoints/g; s/[0-9]{3,} tool definitions/${TOOLS} tool definitions/g" "$CATALOG"
    [ "$(md5sum "$CATALOG" | cut -d" " -f1)" != "$b" ] && { echo "  updated $CATALOG"; CHANGED=$((CHANGED+1)); }
  fi

  # server-card.json is generated (scripts/gen-card.ts), never hand-edited. Regenerate it here so
  # it can never drift from the same DB truth as the text surfaces above.
  PG_IP=$(docker inspect apibase-postgres-1 2>/dev/null | python3 -c "import sys,json; c=json.load(sys.stdin)[0]; print(list(c['NetworkSettings']['Networks'].values())[0]['IPAddress'])")
  if [ -n "$PG_IP" ]; then
    b=$(md5sum static/.well-known/mcp/server-card.json 2>/dev/null | cut -d" " -f1 || echo "")
    DATABASE_URL="postgresql://apibase:$(grep -m1 '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)@${PG_IP}:5432/apibase?schema=public" \
      npx tsx scripts/gen-card.ts > /tmp/gen-card.out 2>&1 \
      || { echo "sync-counts: gen-card.ts FAILED"; cat /tmp/gen-card.out; exit 1; }
    [ "$(md5sum static/.well-known/mcp/server-card.json | cut -d" " -f1)" != "$b" ] && { echo "  updated static/.well-known/mcp/server-card.json"; CHANGED=$((CHANGED+1)); }
  else
    echo "sync-counts: could not resolve postgres container IP"; exit 1
  fi

  # numeric/structured fields: mcp.json tools_count/providers + index.html JSON-LD offerCount
  python3 - "$TOOLS" "$PROV" <<'PY'
import json,sys,re
t,p=int(sys.argv[1]),int(sys.argv[2])
fp="static/.well-known/mcp.json"
try:
    d=json.load(open(fp)); ch=False
    if d.get("tools_count")!=t: d["tools_count"]=t; ch=True
    for k in ("providers_count","providers"):
        if k in d and d[k]!=p: d[k]=p; ch=True
    if ch: json.dump(d,open(fp,"w"),ensure_ascii=False,indent=2); print("  updated",fp)
except FileNotFoundError: pass
ih="static/index.html"
try:
    s=open(ih).read(); s2=re.sub(r'"offerCount":"[0-9]+"', '"offerCount":"%d"'%t, s)
    if s2!=s: open(ih,"w").write(s2); print("  updated index.html JSON-LD offerCount")
except FileNotFoundError: pass
PY

  DESC="Universal MCP gateway for AI agents — ${TOOLS} tools, ${PROV} providers. One endpoint (https://apibase.pro/mcp), pay-per-call with x402 USDC on Base + MPP USDC on Tempo."
  gh repo edit whiteknightonhorse/APIbase --description "$DESC" >/dev/null 2>&1 && echo "  updated GitHub About" || echo "  (GitHub About skipped)"
fi

# verify zero stale catalog counts remain in text surfaces — fatal, not a printed warning.
# Same shape as the fix-pass regex (one optional intervening word): widening it further starts
# matching unrelated prose (e.g. README's "600+ external API tools", a different metric), which
# would fail the build on content this task has no mandate to touch.
STALE=$(grep -rhoE "[0-9]{3,}\+?( [A-Za-z]+)? (tools|providers)" static/*.html static/*.txt README.md 2>/dev/null \
  | grep -vE "^${TOOLS} tools$|^${PROV} (upstream )?providers$|^${TOOLS} [A-Za-z]+ tools$" | sort -u || true)
# Dedicated checks for the three surfaces this task added but whose phrasing the generic
# "<N> tools"/"<N> providers" pattern above cannot see: ai.txt's "Tools: N across" prose,
# api-catalog's two prose titles, and server-card.json's actual array length.
STALE_AI_TXT=$(grep -oE "Tools: [0-9]{3,} across" static/ai.txt 2>/dev/null | grep -v "^Tools: ${TOOLS} across$" || true)
STALE_CATALOG=$(grep -hoE "[0-9]{3,} tool (endpoints|definitions)" "$CATALOG" 2>/dev/null \
  | grep -v "^${TOOLS} tool " | sort -u || true)
SERVER_CARD_LEN=$(python3 -c "import json; print(len(json.load(open('static/.well-known/mcp/server-card.json'))['tools']))")

FAIL=0
[ -n "$STALE" ] && { echo "sync-counts: STALE text surfaces remain:"; echo "$STALE"; FAIL=1; }
[ -n "$STALE_AI_TXT" ] && { echo "sync-counts: STALE ai.txt 'Tools: N across' remains: $STALE_AI_TXT"; FAIL=1; }
[ -n "$STALE_CATALOG" ] && { echo "sync-counts: STALE api-catalog remains:"; echo "$STALE_CATALOG"; FAIL=1; }
[ "$SERVER_CARD_LEN" != "$TOOLS" ] && { echo "sync-counts: server-card.json has $SERVER_CARD_LEN tools, DB says $TOOLS"; FAIL=1; }

if [ "$FAIL" = "0" ]; then
  if [ "$CHECK" = "1" ]; then
    echo "sync-counts: OK (--check, 0 drift) — ai.txt/llms.txt/api-catalog/server-card.json/DB all agree on $TOOLS tools / $PROV providers"
  else
    echo "sync-counts: OK, 0 stale ($CHANGED changed) — ai.txt/llms.txt/api-catalog/server-card.json/DB all agree on $TOOLS tools / $PROV providers"
  fi
else
  if [ "$CHECK" = "1" ]; then
    echo "sync-counts: DRIFT DETECTED (--check) — surfaces disagree with DB truth, run without --check to self-heal"
  else
    echo "sync-counts: FAILED — discovery surfaces disagree, refusing to report success"
  fi
  exit 1
fi
