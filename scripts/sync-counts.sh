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

# T-75 (2026-09-03, Fable ruling): self-heal (no --check) writes TRACKED files. The deploy
# tree (/home/apibase/apibase) belongs to deploy.sh alone (F2 dirty-tree gate) -- a write here
# is exactly what dirtied it every 05:00 and aborted the next deploy. --check stays read-only
# and is still required to work in the deploy tree (CI's static-counts-drift job runs there).
# Self-heal now runs from the fleet worktree via scripts/sync-counts-cron.sh, which commits
# and pushes through the normal gated path -- same shape as .husky/pre-push's own refusal.
if [ "$CHECK" != "1" ] && [ "$(git rev-parse --show-toplevel 2>/dev/null)" = "/home/apibase/apibase" ]; then
  echo "BLOCKED: sync-counts.sh self-heal (no --check) refused in the deploy tree (/home/apibase/apibase)." >&2
  echo "         It writes tracked files there and dirties F2's gate, aborting the next deploy." >&2
  echo "         Run it from the fleet worktree instead: scripts/sync-counts-cron.sh (commits + pushes)." >&2
  echo "         --check is still fine here (read-only) -- CI's static-counts-drift job depends on that." >&2
  exit 1
fi

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
           static/privacy.html static/dashboard.html static/pricing.html static/connect.html \
           static/llms.txt static/ai.txt README.md; do
    [ -f "$f" ] || continue
    b=$(md5sum "$f" | cut -d" " -f1)
    sed -i -E "s/[0-9]{3,}\+?( [A-Za-z]+)? tools/${TOOLS} tools/g; s/[0-9]{3,}\+?( [A-Za-z]+)? providers/${PROV} providers/g; s/Tools: [0-9]{3,} across/Tools: ${TOOLS} across/g" "$f"
    [ "$(md5sum "$f" | cut -d" " -f1)" != "$b" ] && { echo "  updated $f"; CHANGED=$((CHANGED+1)); }
  done

  # F3.1 (2026-09-01): the header sys-monitor bar on contact.html/privacy.html writes the
  # count as a bare number in its own <strong> tag ("PRV:</span><strong>46</strong>"), with no
  # "tools"/"providers" word adjacent for the loop above to match — found stale at 46/203 while
  # DB truth was already 373/1316 (in this loop's OWN file list the whole time, silently never
  # touched by it). One extra targeted pattern, scoped to exactly this markup shape.
  # F6 (2026-09-02): index.html has the IDENTICAL bare-<strong> markup shape and was found
  # stale at 243/833 (live DB already 373/1316) while sitting in the FIRST loop's file list the
  # whole time — same defect class, this file just wasn't added to THIS loop when it was fixed
  # for contact/privacy. sync-counts.sh --check never caught it because its own generic STALE
  # regex (line ~111) also requires an adjacent "tools"/"providers" word this markup lacks.
  # Added here so it can never drift silently again.
  for f in static/index.html static/contact.html static/privacy.html static/terms.html static/policy-moderation.html; do
    [ -f "$f" ] || continue
    b=$(md5sum "$f" | cut -d" " -f1)
    sed -i -E "s/PRV:<\/span><strong>[0-9]+<\/strong>/PRV:<\/span><strong>${PROV}<\/strong>/; s/TOOLS:<\/span><strong>[0-9]+<\/strong>/TOOLS:<\/span><strong>${TOOLS}<\/strong>/" "$f"
    [ "$(md5sum "$f" | cut -d" " -f1)" != "$b" ] && { echo "  updated $f (sys-monitor bar)"; CHANGED=$((CHANGED+1)); }
  done

  # F6 (2026-09-02): a THIRD stale shape, found live on index.html's own footer this same pass
  # — 'TOOLS: N' (uppercase label, number AFTER a colon, no adjacent lowercase 'tools' word) —
  # distinct from both patterns above. Scoped to the literal 'TOOLS: ' label so it can't touch
  # unrelated 'PRICE:'/'PID:' fields on the same line.
  for f in static/index.html static/contact.html static/privacy.html static/dashboard.html; do
    [ -f "$f" ] || continue
    b=$(md5sum "$f" | cut -d" " -f1)
    sed -i -E "s/TOOLS: [0-9]+</TOOLS: ${TOOLS}</g" "$f"
    [ "$(md5sum "$f" | cut -d" " -f1)" != "$b" ] && { echo "  updated $f (footer TOOLS: N)"; CHANGED=$((CHANGED+1)); }
  done

  # api-catalog (RFC 9727 linkset, no file extension so not caught by the glob above) has two
  # hand-written prose titles that reference the tool count in a phrasing the generic patterns
  # above don't match ("N tool endpoints" / "N tool definitions").
  if [ -f "$CATALOG" ]; then
    b=$(md5sum "$CATALOG" | cut -d" " -f1)
    sed -i -E "s/[0-9]{3,} tool endpoints/${TOOLS} tool endpoints/g; s/[0-9]{3,} tool definitions/${TOOLS} tool definitions/g" "$CATALOG"
    [ "$(md5sum "$CATALOG" | cut -d" " -f1)" != "$b" ] && { echo "  updated $CATALOG"; CHANGED=$((CHANGED+1)); }
  fi

  # F-EXT (2026-09-02): README's "N real-world API tools" / "N external API tools"
  # phrasings sat stale (789 / 600+ against live 1316) because the main loop's generic
  # pattern above only tolerates ONE intervening word ("[0-9]+ WORD tools"); both of these
  # have TWO ("real-world API" / "external API") and silently never matched. Confirmed by
  # reading the actual prose, not assumed: both were genuinely the same total-tool-count
  # claim, not a distinct metric (an earlier comment on this file guessed otherwise --
  # wrong, corrected below). Scoped to these two exact phrasings, not a blanket widen of
  # the generic pattern, to avoid it start matching unrelated multi-word prose elsewhere.
  if [ -f README.md ]; then
    b=$(md5sum README.md | cut -d" " -f1)
    sed -i -E "s/[0-9]{2,4}\+? real-world API tools/${TOOLS} real-world API tools/g; s/[0-9]{2,4}\+? external API tools/${TOOLS} external API tools/g" README.md
    [ "$(md5sum README.md | cut -d" " -f1)" != "$b" ] && { echo "  updated README.md (real-world/external API tools phrasing)"; CHANGED=$((CHANGED+1)); }
  fi

  # gen-sitemap.sh -- static/sitemap.xml is generated from the actual served static
  # surface (static/*.html + static/.well-known/**), never hand-edited. Regenerated here
  # so a newly shipped page enters the sitemap on the same day it ships, not months later.
  b=$(md5sum static/sitemap.xml 2>/dev/null | cut -d" " -f1 || echo "")
  bash scripts/gen-sitemap.sh > /tmp/gen-sitemap.out 2>&1 \
    || { echo "sync-counts: gen-sitemap.sh FAILED"; cat /tmp/gen-sitemap.out; exit 1; }
  [ "$(md5sum static/sitemap.xml | cut -d" " -f1)" != "$b" ] && { echo "  updated static/sitemap.xml"; CHANGED=$((CHANGED+1)); }

  # server-card.json is generated (scripts/gen-card.ts), never hand-edited. Regenerate it here so
  # it can never drift from the same DB truth as the text surfaces above.
  PG_IP=$(docker inspect apibase-postgres-1 2>/dev/null | python3 -c "import sys,json; c=json.load(sys.stdin)[0]; print(list(c['NetworkSettings']['Networks'].values())[0]['IPAddress'])")
  if [ -n "$PG_IP" ]; then
    b=$(md5sum static/.well-known/mcp/server-card.json 2>/dev/null | cut -d" " -f1 || echo "")
    DATABASE_URL="postgresql://apibase:$(grep -m1 '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)@${PG_IP}:5432/apibase?schema=public" \
      npx tsx scripts/gen-card.ts > /tmp/gen-card.out 2>&1 \
      || { echo "sync-counts: gen-card.ts FAILED"; cat /tmp/gen-card.out; exit 1; }
    [ "$(md5sum static/.well-known/mcp/server-card.json | cut -d" " -f1)" != "$b" ] && { echo "  updated static/.well-known/mcp/server-card.json"; CHANGED=$((CHANGED+1)); }

    # static/catalog.html (F3.1, 2026-09-01) — same reasoning as server-card.json: a hand-typed
    # provider list would drift the moment onboarding changes the roster. Regenerated wholesale
    # from the same DB truth, not sed-patched.
    b=$(md5sum static/catalog.html 2>/dev/null | cut -d" " -f1 || echo "")
    DATABASE_URL="postgresql://apibase:$(grep -m1 '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)@${PG_IP}:5432/apibase?schema=public" \
      npx tsx scripts/gen-catalog-page.ts > /tmp/gen-catalog-page.out 2>&1 \
      || { echo "sync-counts: gen-catalog-page.ts FAILED"; cat /tmp/gen-catalog-page.out; exit 1; }
    [ "$(md5sum static/catalog.html | cut -d" " -f1)" != "$b" ] && { echo "  updated static/catalog.html"; CHANGED=$((CHANGED+1)); }
  else
    echo "sync-counts: could not resolve postgres container IP"; exit 1
  fi

  # numeric/structured fields: mcp.json tools_count/providers + index.html JSON-LD offerCount
  python3 - "$TOOLS" "$PROV" <<'PY'
import json,sys,re,datetime
t,p=int(sys.argv[1]),int(sys.argv[2])
fp="static/.well-known/mcp.json"
try:
    d=json.load(open(fp)); ch=False
    if d.get("tools_count")!=t: d["tools_count"]=t; ch=True
    for k in ("providers_count","providers"):
        if k in d and d[k]!=p: d[k]=p; ch=True
    # F6 (2026-09-02): "description" is free prose the fields above never touched -- found
    # live at "1227+ API tools from 347 providers" while tools_count/providers_count on the
    # very next lines of the SAME file already said 1316/373. An agent reading this file for
    # discovery (its own "documentation" field points AI agents here) saw two different tool
    # counts three lines apart. Rewritten from the live numbers on every run, not hand-typed.
    desc=re.sub(r"[0-9]+\+? API tools from [0-9]+\+? providers", "%d API tools from %d providers" % (t, p), d.get("description",""))
    if desc != d.get("description"): d["description"]=desc; ch=True
    if ch:
        d["updated_at"]=datetime.date.today().isoformat()
        json.dump(d,open(fp,"w"),ensure_ascii=False,indent=2); print("  updated",fp)
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
# Same shape as the fix-pass regex (one optional intervening word) -- catches the common case;
# README's "N real-world/external API tools" phrasings (two intervening words) have their OWN
# dedicated STALE_README_PROSE check below (2026-09-02 correction: an earlier version of this
# comment guessed "600+ external API tools" was a different metric -- it was not, it was the
# same stale-count defect, confirmed by reading the actual prose).
STALE=$(grep -rhoE "[0-9]{3,}\+?( [A-Za-z]+)? (tools|providers)" static/*.html static/*.txt README.md 2>/dev/null \
  | grep -vE "^${TOOLS} tools$|^${PROV} (upstream )?providers$|^${TOOLS} [A-Za-z]+ tools$" | sort -u || true)
# Dedicated checks for the three surfaces this task added but whose phrasing the generic
# "<N> tools"/"<N> providers" pattern above cannot see: ai.txt's "Tools: N across" prose,
# api-catalog's two prose titles, and server-card.json's actual array length.
STALE_AI_TXT=$(grep -oE "Tools: [0-9]{3,} across" static/ai.txt 2>/dev/null | grep -v "^Tools: ${TOOLS} across$" || true)
STALE_CATALOG=$(grep -hoE "[0-9]{3,} tool (endpoints|definitions)" "$CATALOG" 2>/dev/null \
  | grep -v "^${TOOLS} tool " | sort -u || true)
SERVER_CARD_LEN=$(python3 -c "import json; print(len(json.load(open('static/.well-known/mcp/server-card.json'))['tools']))")
STALE_README_PROSE=$(grep -oE "[0-9]{2,4}\+? real-world API tools|[0-9]{2,4}\+? external API tools" README.md 2>/dev/null \
  | grep -vE "^${TOOLS} real-world API tools$|^${TOOLS} external API tools$" || true)
# Q3 (Fable ruling, T-30 dispute q-1, 2026-09-02): a negative check instead of another
# precise per-phrase regex -- README.md must not carry ANY digit+tool/provider/schema/
# categor/integration/registr phrasing except the two exact drift-checked forms
# ("${TOOLS} tools" / "${PROV} providers"). This is what stops a THIRD hand-typed count
# (a "490 tool schemas" or "21 categories") from ever sitting stale in README again --
# instead of writing it as a fixed number, don't write it as a number at all.
# T-40 (2026-09-02, Fable rejection of the T-30 close): found live at "14-stage pipeline"
# / "16-container Docker stack" (README.md:60) -- two gaps in the pattern above, both
# fixed here so a third never repeats:
#   1. the word list was missing "stage"/"container" entirely -- these two counts about
#      our own infra can drift exactly like a tool/provider count (they already did once,
#      13-stage -> 14-stage, per the MODERATION-stage insertion 2026-09-01) and nothing
#      caught it because the regex never looked for those words at all.
#   2. even for the words it DID cover, the separator was " ?" (space only) -- it could
#      never have matched "14-stage" or "16-container" anyway, both hyphenated, not
#      spaced. Widened to "[ -]?" so both spacing styles are covered for every word.
# Fixed in README itself by removing the numbers ("multi-stage pipeline", "Docker stack",
# exact counts pushed to docs/architecture.md instead) -- this check is the guardrail
# against either number quietly coming back.
STALE_README_NUMBERS=$(grep -ohE '[0-9]{2,4}\+?[ -]?(tool|provider|schema|categor|integration|registr|stage|container)[a-zA-Z]*' README.md 2>/dev/null \
  | grep -vE "^${TOOLS} tools$|^${PROV} providers$" | sort -u || true)
# T-40: the MCP Registry badge hardcoded a version number ("MCP_Registry-v1.0.2-blue")
# that no drift check ever read -- same class of defect as the two above, just inside a
# shields.io badge URL instead of prose. Every OTHER badge in README (Security Audit,
# Deploy, License, Smithery, MPPScan) already carries no digit in its label; this check
# holds the MCP Registry badge to the same bar instead of adding a version-specific gate
# that would just be a fourth hand-typed regex to rot.
STALE_README_BADGE_NUM=$(grep -oE 'shields\.io/badge/[^)]*' README.md 2>/dev/null | grep -E '[0-9]' || true)
# static/sitemap.xml must carry a <loc> for every static page + .well-known file we actually
# serve -- this is what caught the sitemap sitting stale since 2026-04-22 missing /pricing,
# /catalog, /connect, /policy/moderation (all shipped after that date). Read-only re-derivation
# of the same URL list gen-sitemap.sh builds, diffed against what is currently on disk.
STALE_SITEMAP=$(diff <(bash scripts/gen-sitemap.sh --print 2>/dev/null | grep -oE "<loc>[^<]+</loc>" | sort) \
  <(grep -oE "<loc>[^<]+</loc>" static/sitemap.xml 2>/dev/null | sort) || true)
# F6 (2026-09-02): the bare "PRV:</span><strong>N</strong>" sys-monitor shape (index/contact/
# privacy) has no adjacent "tools"/"providers" word, so the generic STALE regex above is
# structurally blind to it — this is exactly the shape that let index.html sit stale at 243/833
# while this script's own --check reported 0 drift. Checked directly, every run, not just when
# a fix pass happens to touch these files.
STALE_SYSMON=$(grep -hoE "PRV:</span><strong>[0-9]+</strong>|TOOLS:</span><strong>[0-9]+</strong>" static/index.html static/contact.html static/privacy.html static/terms.html static/policy-moderation.html 2>/dev/null \
  | grep -vE "^PRV:</span><strong>${PROV}</strong>$|^TOOLS:</span><strong>${TOOLS}</strong>$" | sort -u || true)
STALE_FOOTER_TOOLS=$(grep -hoE "TOOLS: [0-9]+<" static/index.html static/contact.html static/privacy.html static/dashboard.html 2>/dev/null \
  | grep -v "^TOOLS: ${TOOLS}<$" | sort -u || true)
STALE_MCP_DESC=$(python3 -c "
import json,re
d=json.load(open('static/.well-known/mcp.json'))
m=re.search(r'([0-9]+\+? API tools from [0-9]+\+? providers)', d.get('description',''))
print(m.group(1) if m and m.group(1)!='${TOOLS} API tools from ${PROV} providers' else '')
" 2>/dev/null || true)

FAIL=0
[ -n "$STALE" ] && { echo "sync-counts: STALE text surfaces remain:"; echo "$STALE"; FAIL=1; }
[ -n "$STALE_AI_TXT" ] && { echo "sync-counts: STALE ai.txt 'Tools: N across' remains: $STALE_AI_TXT"; FAIL=1; }
[ -n "$STALE_CATALOG" ] && { echo "sync-counts: STALE api-catalog remains:"; echo "$STALE_CATALOG"; FAIL=1; }
[ "$SERVER_CARD_LEN" != "$TOOLS" ] && { echo "sync-counts: server-card.json has $SERVER_CARD_LEN tools, DB says $TOOLS"; FAIL=1; }
[ -n "$STALE_SYSMON" ] && { echo "sync-counts: STALE sys-monitor bar(s) remain:"; echo "$STALE_SYSMON"; FAIL=1; }
[ -n "$STALE_FOOTER_TOOLS" ] && { echo "sync-counts: STALE footer 'TOOLS: N' remain:"; echo "$STALE_FOOTER_TOOLS"; FAIL=1; }
[ -n "$STALE_MCP_DESC" ] && { echo "sync-counts: STALE mcp.json description remains: $STALE_MCP_DESC"; FAIL=1; }
[ -n "$STALE_README_PROSE" ] && { echo "sync-counts: STALE README prose remains:"; echo "$STALE_README_PROSE"; FAIL=1; }
[ -n "$STALE_README_NUMBERS" ] && { echo "sync-counts: README.md has a number+tool/provider/schema/categor/integration/registr/stage/container phrase that isn't the two covered forms:"; echo "$STALE_README_NUMBERS"; FAIL=1; }
[ -n "$STALE_README_BADGE_NUM" ] && { echo "sync-counts: README.md has a shields.io badge with a hand-typed number remaining:"; echo "$STALE_README_BADGE_NUM"; FAIL=1; }
[ -n "$STALE_SITEMAP" ] && { echo "sync-counts: STALE static/sitemap.xml — differs from the generated URL set:"; echo "$STALE_SITEMAP"; FAIL=1; }

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
