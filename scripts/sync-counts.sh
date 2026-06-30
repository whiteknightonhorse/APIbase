#!/usr/bin/env bash
# sync-counts.sh — propagate the LIVE healthy tool/provider counts to EVERY public surface.
# Source of truth: DB tools WHERE status='healthy' (== what the live MCP /api/v1/tools serves).
# Idempotent + safe: only rewrites 3+-digit "<N> tools" / "<N> providers" catalog phrases.
# MANDATORY after every onboarding batch (onboard-provider skill Step 12/12.5 + orchestra push-batch).
set -euo pipefail
ROOT="${ROOT:-/home/apibase/apibase}"; cd "$ROOT"

COUNTS=$(docker exec apibase-postgres-1 psql -U apibase -d apibase -tAc \
  "select count(*)||' '||count(distinct provider) from tools where status='healthy'")
TOOLS=$(echo "$COUNTS" | awk '{print $1}'); PROV=$(echo "$COUNTS" | awk '{print $2}')
[ -n "$TOOLS" ] && [ -n "$PROV" ] || { echo "sync-counts: failed to read counts"; exit 1; }
echo "sync-counts: live healthy = $TOOLS tools / $PROV providers"

CHANGED=0
for f in static/index.html static/terms.html static/frameworks.html static/contact.html \
         static/privacy.html static/dashboard.html static/llms.txt static/ai.txt README.md; do
  [ -f "$f" ] || continue
  b=$(md5sum "$f" | cut -d" " -f1)
  sed -i -E "s/[0-9]{3,}\+?( [A-Za-z]+)? tools/${TOOLS} tools/g; s/[0-9]{3,}\+?( [A-Za-z]+)? providers/${PROV} providers/g" "$f"
  [ "$(md5sum "$f" | cut -d" " -f1)" != "$b" ] && { echo "  updated $f"; CHANGED=$((CHANGED+1)); }
done

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

# verify zero stale catalog counts remain in text surfaces
STALE=$(grep -rhoE "[0-9]{3,}\+?( [A-Za-z]+)? (tools|providers)" static/*.html static/*.txt README.md 2>/dev/null \
  | grep -vE "^${TOOLS} tools$|^${PROV} (upstream )?providers$|^${TOOLS} [A-Za-z]+ tools$" | sort -u || true)
[ -z "$STALE" ] && echo "sync-counts: OK, 0 stale ($CHANGED changed)" || { echo "sync-counts: STALE REMAIN:"; echo "$STALE"; }
