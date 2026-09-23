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
# gen-card.ts regen, no GitHub About edit), it only compares current on-disk surfaces against a
# baseline and fails (exit 1) on any drift. Gates/CI must use --check — self-heal mode always
# exits 0 by construction (it fixes drift before verifying it), so it can never catch a regression.
# T-05 (2026-09-04, ruling-1): --check used to treat a fresh live-DB query as the baseline for
# internal-consistency (do all surfaces agree with each other) AND compare it byte-exact — but
# AP-8 now demotes providers continuously (every ~10min tick), so the live count moves dozens of
# times a day while the committed surfaces (updated once by self-heal) always trail it by some
# amount. A byte-exact check against a constantly moving target turns "surfaces agree with what
# we committed" (a real bug) and "the DB moved since we last synced" (expected lag, not a bug)
# into the same red X. Split in two: internal consistency is checked against the COMMITTED
# baseline (mcp.json's own tools_count/providers_count — what self-heal itself just wrote),
# exact as before; freshness (that baseline vs. the live DB right now) is checked separately with
# a tolerance, so a few AP-8 demotions between self-heal runs don't fail the gate, but a "94 vs
# 1316" class drift (the actual bug this gate was built to catch, T-30) still does.
FRESHNESS_TOLERANCE_PCT=3
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

CATALOG="static/.well-known/api-catalog"
CHANGED=0
if [ "$CHECK" = "1" ]; then
  # Internal-consistency baseline = what self-heal itself last committed (mcp.json's own
  # tools_count/providers_count), NOT a fresh query -- see the FRESHNESS_TOLERANCE_PCT comment
  # near the top of this file for why. Every STALE_* check below now compares surfaces against
  # THIS baseline, exactly as before (still byte-exact, still fatal).
  BASELINE="$(python3 -c "
import json
d = json.load(open('static/.well-known/mcp.json'))
t = d.get('tools_count')
p = d.get('providers_count', d.get('providers'))
print('%s %s' % (t, p))
" 2>/dev/null || true)"
  TOOLS=$(echo "$BASELINE" | awk '{print $1}'); PROV=$(echo "$BASELINE" | awk '{print $2}')
  case "$TOOLS" in ''|*[!0-9]*) TOOLS="" ;; esac
  case "$PROV" in ''|*[!0-9]*) PROV="" ;; esac
  [ -n "$TOOLS" ] && [ -n "$PROV" ] \
    || { echo "sync-counts: --check could not read tools_count/providers_count from static/.well-known/mcp.json"; exit 1; }
  echo "sync-counts: --check baseline (static/.well-known/mcp.json, last self-heal) = $TOOLS tools / $PROV providers"

  # Freshness: baseline vs. the live DB right now, with a tolerance -- AP-8 demotes providers
  # continuously between self-heal runs, so SOME drift is expected and must not fail the gate;
  # a "94 vs 1316" class drift (T-30, the bug this gate exists to catch) still must.
  LIVE_COUNTS=$(docker exec apibase-postgres-1 psql -U apibase -d apibase -tAc \
    "select count(*)||' '||count(distinct provider) from tools where status != 'unavailable'")
  LIVE_TOOLS=$(echo "$LIVE_COUNTS" | awk '{print $1}'); LIVE_PROV=$(echo "$LIVE_COUNTS" | awk '{print $2}')
  [ -n "$LIVE_TOOLS" ] && [ -n "$LIVE_PROV" ] || { echo "sync-counts: --check failed to read live DB counts"; exit 1; }
  echo "sync-counts: --check live DB right now = $LIVE_TOOLS tools / $LIVE_PROV providers"

  # Symmetric percent drift in tenths of a percent (integer arithmetic -- bash has no floats):
  # |live-baseline| / baseline * 1000, compared against FRESHNESS_TOLERANCE_PCT*10.
  TOOLS_DIFF=$(( LIVE_TOOLS>TOOLS ? LIVE_TOOLS-TOOLS : TOOLS-LIVE_TOOLS ))
  PROV_DIFF=$(( LIVE_PROV>PROV ? LIVE_PROV-PROV : PROV-LIVE_PROV ))
  TOOLS_DIFF_PCT_X10=$(( TOOLS > 0 ? (TOOLS_DIFF * 1000) / TOOLS : 1000 ))
  PROV_DIFF_PCT_X10=$(( PROV > 0 ? (PROV_DIFF * 1000) / PROV : 1000 ))
  TOLERANCE_X10=$(( FRESHNESS_TOLERANCE_PCT * 10 ))
  FRESH_FAIL=0
  if [ "$TOOLS_DIFF_PCT_X10" -gt "$TOLERANCE_X10" ]; then
    echo "sync-counts: FRESHNESS FAIL -- tools baseline $TOOLS vs live $LIVE_TOOLS is $((TOOLS_DIFF_PCT_X10/10)).$((TOOLS_DIFF_PCT_X10%10))% off, tolerance ${FRESHNESS_TOLERANCE_PCT}%"
    FRESH_FAIL=1
  fi
  if [ "$PROV_DIFF_PCT_X10" -gt "$TOLERANCE_X10" ]; then
    echo "sync-counts: FRESHNESS FAIL -- providers baseline $PROV vs live $LIVE_PROV is $((PROV_DIFF_PCT_X10/10)).$((PROV_DIFF_PCT_X10%10))% off, tolerance ${FRESHNESS_TOLERANCE_PCT}%"
    FRESH_FAIL=1
  fi
  if [ "$FRESH_FAIL" = "1" ]; then
    echo "sync-counts: run self-heal (scripts/sync-counts-cron.sh) to catch up; if this keeps failing right after a self-heal run, that's the real T-30-class bug this gate exists to catch"
    exit 1
  fi
  echo "sync-counts: --check freshness OK (within ${FRESHNESS_TOLERANCE_PCT}% of live)"
  echo "sync-counts: --check mode — read-only, no file will be written"

  # ZZ-03-06 attempt-3 (Fable REJECT, disputes/zz-03-apibase-design.q-7.ruling-1.md item 6):
  # gen-discovery.ts/generate-openapi.ts --check do a byte-for-byte compare of every generated
  # surface against a freshly rebuilt candidate (dates masked the same way self-heal's own
  # idempotent write already does) instead of grepping 3-4 named fields -- this is what makes
  # `sed 's/\b1380\b/999/g'` on agent-skills/index.json's or ai-capabilities.json's free-text
  # description, or agent.json's description, show up as drift instead of staying invisible.
  #
  # Rebuilt from scripts/discovery-snapshot.tsv (tracked, committed by self-heal in the SAME
  # commit as the files it fed) -- NOT a fresh live DB query. A fresh query would make this
  # gate red between every self-heal run for free: AP-8 demotes/promotes providers continuously
  # (T-05, 2026-09-04, ruling-1), so live counts always drift a little from what was last
  # committed, and that drift is legitimate lag, not tampering -- exactly the false positive T-05
  # already fixed once for the aggregate count and that a live-query byte-diff would reintroduce
  # for the other seven surfaces (confirmed while building this: --check against a live snapshot
  # flagged all seven files as "drifted" simply because live had moved from 1380 to 1387 tools
  # since the last self-heal, with nothing actually wrong). Diffing against the SAME frozen input
  # the current commit was generated from means 0 drift whenever nothing was hand-edited, and
  # real drift whenever it was -- freshness (whether a new self-heal is now due) stays the
  # separate check above, unchanged. No DB/.env access needed for this part of --check at all.
  # `VAR=$(cmd)` with a failing cmd trips `set -e` on THIS line, before `GEN_..._RC=$?` below it
  # ever runs -- same `&&`/`||` idiom sync-counts-cron.sh:231 already uses for the same reason.
  GEN_DISCOVERY_CHECK_OUT="$(SYNC_COUNTS_SNAPSHOT="scripts/discovery-snapshot.tsv" npx tsx scripts/gen-discovery.ts --check 2>&1)" \
    && GEN_DISCOVERY_CHECK_RC=0 || GEN_DISCOVERY_CHECK_RC=$?
  GEN_OPENAPI_CHECK_OUT="$(SYNC_COUNTS_SNAPSHOT="scripts/discovery-snapshot.tsv" npx tsx scripts/generate-openapi.ts --check 2>&1)" \
    && GEN_OPENAPI_CHECK_RC=0 || GEN_OPENAPI_CHECK_RC=$?
else
  # Self-heal: one atomic point-in-time snapshot of every active tool_id+provider, not just an
  # aggregate count. T-05 (2026-09-04, ruling-1): gen-card.ts/gen-catalog-page.ts used to run
  # their OWN separate DB queries after this one -- three queries, three chances to see a
  # DIFFERENT slice of `tools` if AP-8 writes mid-run (confirmed live: this query returned
  # 1352/384, gen-card.ts's own query returned 1344, gen-catalog-page.ts's returned 1340/381 --
  # all three from ONE run, six seconds apart, while AP-8 was mid-tick demoting providers).
  # Every consumer of this run now reads the SAME frozen set via SYNC_COUNTS_SNAPSHOT.
  SNAPSHOT="$(mktemp /tmp/sync-counts-snapshot.XXXXXX)"
  trap 'rm -f "$SNAPSHOT"' EXIT
  docker exec apibase-postgres-1 psql -U apibase -d apibase -tAc \
    "select tool_id||E'\t'||provider from tools where status != 'unavailable' order by tool_id" > "$SNAPSHOT"
  TOOLS=$(wc -l < "$SNAPSHOT" | tr -d ' ')
  PROV=$(cut -f2 "$SNAPSHOT" | sort -u | wc -l | tr -d ' ')
  [ -n "$TOOLS" ] && [ "$TOOLS" != "0" ] && [ -n "$PROV" ] && [ "$PROV" != "0" ] \
    || { echo "sync-counts: failed to read counts"; exit 1; }
  export SYNC_COUNTS_SNAPSHOT="$SNAPSHOT"
  echo "sync-counts: live active (status != unavailable) = $TOOLS tools / $PROV providers (snapshot $SNAPSHOT)"

  # ZZ-03-06 attempt-3: persist this exact frozen tool_id/provider set to a TRACKED path,
  # committed alongside the seven discovery surfaces + openapi.json it feeds -- this is what lets
  # --check rebuild a byte-for-byte candidate from the SAME input the current commit used,
  # instead of a fresh live query that would always show drift by the time the next self-heal
  # runs (see the long comment on --check's own invocation of this, above). Idempotent: byte-
  # identical to what's already committed whenever the active tool_id/provider set hasn't
  # actually changed, so a no-op run touches 0 bytes here just like every other generated file.
  DISCOVERY_SNAPSHOT_TRACKED="scripts/discovery-snapshot.tsv"
  b=$(md5sum "$DISCOVERY_SNAPSHOT_TRACKED" 2>/dev/null | cut -d" " -f1 || echo "")
  cp "$SNAPSHOT" "$DISCOVERY_SNAPSHOT_TRACKED"
  [ "$(md5sum "$DISCOVERY_SNAPSHOT_TRACKED" | cut -d" " -f1)" != "$b" ] \
    && { echo "  updated $DISCOVERY_SNAPSHOT_TRACKED"; CHANGED=$((CHANGED+1)); }

  for f in static/index.html static/terms.html static/frameworks.html static/contact.html \
           static/privacy.html static/dashboard.html static/pricing.html static/connect.html \
           static/why.html static/why.md static/flight-search-intent.html \
           static/image-generation-intent.html static/company-research-intent.html \
           static/llms.txt static/ai.txt static/index.md README.md; do
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
  declare -A MD5_BEFORE_DISCOVERY
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

    # ZZ-03-06 (zz-03 Q7 ruling-1): scripts/gen-discovery.ts is now the ONLY writer of
    # mcp.json, agent.json, ai-capabilities.json, ucp, acp.json, agent-skills/index.json,
    # agent-skills/discover-tools.md — replaces the old inline python mcp.json sed/patch
    # block that lived here (this was exactly the mechanism that let ai-capabilities.json,
    # agent.json, ucp, acp.json, agent-skills/* drift for 5+ months: nothing ever wrote them
    # at all, this gate only ever touched mcp.json). All seven are now generated wholesale
    # from the same TOOL_DEFINITIONS ∩ active-DB-snapshot intersection gen-card.ts uses, via
    # the same SYNC_COUNTS_SNAPSHOT so every generator in this run agrees exactly. Idempotent
    # (see gen-discovery.ts's writeJsonIfChanged/writeTextIfChanged) -- a run with 0 real drift
    # touches 0 bytes of these seven files, no daily date-churn commits.
    for f in static/.well-known/mcp.json static/.well-known/agent.json \
             static/.well-known/ai-capabilities.json static/.well-known/ucp \
             static/.well-known/acp.json static/.well-known/agent-skills/index.json \
             static/.well-known/agent-skills/discover-tools.md; do
      [ -f "$f" ] && MD5_BEFORE_DISCOVERY["$f"]=$(md5sum "$f" | cut -d" " -f1)
    done
    DATABASE_URL="postgresql://apibase:$(grep -m1 '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)@${PG_IP}:5432/apibase?schema=public" \
      npx tsx scripts/gen-discovery.ts > /tmp/gen-discovery.out 2>&1 \
      || { echo "sync-counts: gen-discovery.ts FAILED"; cat /tmp/gen-discovery.out; exit 1; }
    cat /tmp/gen-discovery.out
    for f in static/.well-known/mcp.json static/.well-known/agent.json \
             static/.well-known/ai-capabilities.json static/.well-known/ucp \
             static/.well-known/acp.json static/.well-known/agent-skills/index.json \
             static/.well-known/agent-skills/discover-tools.md; do
      [ -f "$f" ] && [ "$(md5sum "$f" | cut -d" " -f1)" != "${MD5_BEFORE_DISCOVERY[$f]:-}" ] \
        && { echo "  updated $f"; CHANGED=$((CHANGED+1)); }
    done

    # generate-openapi.ts (ZZ-03-06): filters TOOL_DEFINITIONS to the same active-DB
    # intersection (fixes the confirmed 52-path surplus, 1436 TOOL_DEFINITIONS vs 1384 live
    # tools) and reads info.version from package.json instead of a hardcoded "1.0.0".
    # Regenerated here so it can never drift from the same DB truth as the other six.
    b=$(md5sum static/.well-known/openapi.json 2>/dev/null | cut -d" " -f1 || echo "")
    DATABASE_URL="postgresql://apibase:$(grep -m1 '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)@${PG_IP}:5432/apibase?schema=public" \
      npx tsx scripts/generate-openapi.ts > /tmp/generate-openapi.out 2>&1 \
      || { echo "sync-counts: generate-openapi.ts FAILED"; cat /tmp/generate-openapi.out; exit 1; }
    cat /tmp/generate-openapi.out
    [ "$(md5sum static/.well-known/openapi.json | cut -d" " -f1)" != "$b" ] && { echo "  updated static/.well-known/openapi.json"; CHANGED=$((CHANGED+1)); }
  else
    echo "sync-counts: could not resolve postgres container IP"; exit 1
  fi

  # index.html JSON-LD offerCount -- the one numeric field on a hand-maintained page this
  # generic sed loop can't reach (it needs the "tools"/"providers" word adjacent, this doesn't).
  python3 - "$TOOLS" <<'PY'
import re,sys
t=int(sys.argv[1])
ih="static/index.html"
try:
    s=open(ih).read(); s2=re.sub(r'"offerCount":"[0-9]+"', '"offerCount":"%d"'%t, s)
    if s2!=s: open(ih,"w").write(s2); print("  updated index.html JSON-LD offerCount")
except FileNotFoundError: pass
PY

  # GH-1 (docs/03-SPECIFICATION.md §16, ZZ-03-13): GitHub About is a THIRD-PARTY-cached
  # page like npm/Official Registry (see D-2 above) -- POS-1's no-numbers variant, not the
  # numbered README/llms.txt sentence, so a stale count here can never happen again the
  # same way SERVER_INFO's did (M-2). Do not swap this back to the ${TOOLS}/${PROV} form.
  DESC="One MCP + REST endpoint to APIbase's live tool catalog (counts: https://apibase.pro/llms.txt). No signup, no subscription, no API key to start — pay per call in USDC (x402 on Base or MPP on Tempo)."
  gh repo edit whiteknightonhorse/APIbase --description "$DESC" >/dev/null 2>&1 && echo "  updated GitHub About" || echo "  (GitHub About skipped)"
fi

# verify zero stale catalog counts remain in text surfaces — fatal, not a printed warning.
# Same shape as the fix-pass regex (one optional intervening word) -- catches the common case;
# README's "N real-world/external API tools" phrasings (two intervening words) have their OWN
# dedicated STALE_README_PROSE check below (2026-09-02 correction: an earlier version of this
# comment guessed "600+ external API tools" was a different metric -- it was not, it was the
# same stale-count defect, confirmed by reading the actual prose).
# T-0173 (2026-09-23, ruling-1 task A): this used to be a FLAT, non-recursive glob
# (static/*.html static/*.txt README.md) -- structurally blind to any .md file (static/index.md,
# a plain markdown mirror of the homepage served via `Accept: text/markdown` content
# negotiation, nginx.conf @homepage_markdown) and to anything one directory deeper
# (static/video/index.html, static/.well-known/**). That blind spot is exactly what let
# static/index.md sit stale at "502 API tools from 158+ providers" and static/video/index.html
# at "409 Tools, 121 Providers" while this check kept reporting 0 drift -- neither file was ever
# in the glob's search path. Recursive over every static/**/*.{html,md,txt} + README.md now,
# with an explicit exempt list below -- each entry must carry a reason, so a real stale surface
# can't quietly join the exempt list without one being written down.
STALE_EXEMPT=(
  # Dated blog post artifact: the counts inside are a historical fact about the catalog's size
  # on the day this was published, not a live claim -- same reasoning already applied to
  # docs/releases/*.md (outside static/, never swept by this glob at all).
  "static/devto-article-1.md"
)
STALE_SCAN_FILES=("README.md")
while IFS= read -r f; do
  skip=0
  for ex in "${STALE_EXEMPT[@]}"; do [ "$f" = "$ex" ] && { skip=1; break; }; done
  [ "$skip" = "0" ] && STALE_SCAN_FILES+=("$f")
done < <(find static -type f \( -name "*.html" -o -name "*.md" -o -name "*.txt" \) | sort)
STALE=$(grep -hoE "[0-9]{3,}\+?( [A-Za-z]+)? (tools|providers)" "${STALE_SCAN_FILES[@]}" 2>/dev/null \
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
# ZZ-03-06 (zz-03 Q7 ruling-1, item 8 + subquestion 2): the README "no number" rule above
# extends to static/*.md and agent-skills/*.md -- this is what caught static/index.md and
# static/devto-article-1.md both claiming "13-stage pipeline" (real, runtime-verified count is
# 14, see pipeline.ts's verifyStageOrder()) while nothing read either file. Scoped to the stage
# COUNT claim specifically (not every historical number in devto-article-1.md's narrative,
# which is a dated blog post, not a live-synced surface) -- same reasoning as README's own
# "13-stage -> 14-stage" gap (T-40). Direction matters: matches "13-stage"/"13 stages" but not
# "Stage 1: AUTH" (number follows the word there, not before it).
# T-0173 (2026-09-23, ruling-1 task A): extended to static/video/templates/*.html -- the
# slideshow's own pipeline slide is exactly this class of surface (a hand-typed stage count in
# a title/caption) and had no guard against the same "13-stage" drift the rest of this check
# already exists to catch.
STALE_STAGE_COUNT=$(grep -rnoE '[0-9]{1,2}[ -]stages?\b' static/*.md static/.well-known/agent-skills/*.md static/video/templates/*.html 2>/dev/null || true)
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
# ZZ-03-06 attempt-3 (Fable REJECT item 6): mcp.json/agent.json/ai-capabilities.json/ucp/
# acp.json/agent-skills/index.json/agent-skills/discover-tools.md's counts, versions, embedded
# prose numbers and sha256 hashes were, until this attempt, checked field-by-field here -- and
# confirmed to miss a stale number sitting in free-text description prose (see
# GEN_DISCOVERY_CHECK_RC below, which now replaces all of that with one byte-for-byte compare
# against a freshly rebuilt candidate). What's left here is the one check that byte-diffing
# gen-discovery.ts's OWN output can't cover: agreement between TWO INDEPENDENT generators
# (openapi.json from generate-openapi.ts, server-card.json from gen-card.ts, outside this task's
# scope) -- this is the exact shape of the confirmed 52-path surplus bug (1436 TOOL_DEFINITIONS
# entries vs 1384 active tools), plus server-card.json's version, which nothing else checks.
STALE_DISCOVERY=$(python3 - <<'PY' 2>&1
import json

with open('package.json') as f:
    PKG_VERSION = json.load(f)['version']

problems = []


def load(path):
    try:
        return json.load(open(path))
    except FileNotFoundError:
        return None


openapi = load("static/.well-known/openapi.json")
server_card = load("static/.well-known/mcp/server-card.json")
if openapi is not None and server_card is not None:
    tool_paths = len(openapi.get("paths", {})) - 3  # listTools, discoverTools, registerAgent
    card_tools = len(server_card.get("tools", []))
    if tool_paths != card_tools:
        problems.append(f"openapi.json has {tool_paths} tool paths, server-card.json has {card_tools} tools")
if server_card is not None and server_card.get("version") != PKG_VERSION:
    problems.append(f"server-card.json version {server_card.get('version')!r} != package.json {PKG_VERSION!r}")

print("\n".join(problems))
PY
)

# POS-1 (docs/03-SPECIFICATION.md §13, zz-03 Q5 ruling): a single canonical lead sentence,
# "One MCP + REST endpoint to {TOOLS} tools from {PROV} providers. No signup, no subscription,
# no API key to start...", replaces README/llms.txt's first sentence as of ZZ-03-09. If the
# distinctive "No signup, no subscription, no API key to start" phrase is found anywhere in
# README.md/static/llms.txt, its embedded {TOOLS}/{PROV} numbers must match baseline, fatal if
# not. If the phrase isn't present in a given file, that file reports clean (nothing to be
# stale there) rather than failing.
STALE_POSITIONING=$(python3 - "$TOOLS" "$PROV" <<'PY' 2>&1
import re, sys

TOOLS, PROV = int(sys.argv[1]), int(sys.argv[2])
problems = []
for path in ("README.md", "static/llms.txt"):
    try:
        text = open(path).read()
    except FileNotFoundError:
        continue
    for m in re.finditer(r"([0-9]+) tools from ([0-9]+) providers\. No signup, no subscription, no API key to start", text):
        if int(m.group(1)) != TOOLS or int(m.group(2)) != PROV:
            problems.append(f"{path}: canonical POS-1 sentence embeds {m.group(1)}/{m.group(2)}, baseline is {TOOLS}/{PROV}")
print("\n".join(problems))
PY
)

# POS-2 (docs/03-SPECIFICATION.md §13, zz-03 Q5 Rule 1, ZZ-03-09): explicit deny-list of
# unshipped-capability phrases across every lead surface. "best provider" is banned, but bare
# "Best" is not (POS-4 is a separate, operator-gated decision about the index.html title/h1 —
# not this regex). Fatal the moment any of these lands in copy, so a future edit can't
# reintroduce an overclaim silently; mutation-tested by inserting one of these phrases into
# README.md and confirming this goes red.
STALE_FORBIDDEN_POSITIONING=$(grep -rniE 'capability layer|intelligent routing|smart routing|automatic failover|fallback|execution layer|best provider' \
  README.md static/llms.txt static/ai.txt static/index.md static/index.html 2>/dev/null || true)

# POS-3 (docs/03-SPECIFICATION.md §13, zz-03 Q5 ruling Rule 4): docs/ROADMAP.md with strict
# line format `- [PLANNED|IN PROGRESS T-NNNN|SHIPPED YYYY-MM-DD <sha>|DROPPED YYYY-MM-DD
# <reason>] Q<N> — <one line>` is its OWN fleet task (ZZ-03-13, P1, not yet dispatched -- see
# 05-PROPOSED-FLEET-TASKS.md). Same reasoning as STALE_POSITIONING above: live but vacuous until
# docs/ROADMAP.md exists. Once it does, every line starting "- [" must match the strict format,
# every SHIPPED sha must resolve in this repo, and "Last reviewed: YYYY-MM-DD" (if present) must
# be <=45 days old.
STALE_ROADMAP=$(python3 - <<'PY' 2>&1
import re, subprocess
from datetime import date, datetime

path = "docs/ROADMAP.md"
try:
    lines = open(path).read().splitlines()
except FileNotFoundError:
    raise SystemExit

problems = []
line_re = re.compile(
    r"^- \[(PLANNED|IN PROGRESS T-\d+|SHIPPED \d{4}-\d{2}-\d{2} [0-9a-f]{7,40}|DROPPED \d{4}-\d{2}-\d{2} .+)\] Q\d+ — .+$"
)
for i, line in enumerate(lines, 1):
    if not line.startswith("- ["):
        continue
    if not line_re.match(line):
        problems.append(f"{path}:{i}: malformed roadmap line: {line}")
        continue
    m = re.search(r"SHIPPED \d{4}-\d{2}-\d{2} ([0-9a-f]{7,40})", line)
    if m:
        sha = m.group(1)
        rc = subprocess.run(["git", "cat-file", "-e", sha], capture_output=True)
        if rc.returncode != 0:
            problems.append(f"{path}:{i}: SHIPPED sha {sha} does not exist in this repo")

m = re.search(r"Last reviewed:\s*(\d{4}-\d{2}-\d{2})", "\n".join(lines))
if m:
    reviewed = datetime.strptime(m.group(1), "%Y-%m-%d").date()
    age = (date.today() - reviewed).days
    if age > 45:
        problems.append(f"{path}: Last reviewed {m.group(1)} is {age} days old (>45)")

print("\n".join(problems))
PY
)

FAIL=0
[ -n "$STALE" ] && { echo "sync-counts: STALE text surfaces remain:"; echo "$STALE"; FAIL=1; }
[ -n "$STALE_AI_TXT" ] && { echo "sync-counts: STALE ai.txt 'Tools: N across' remains: $STALE_AI_TXT"; FAIL=1; }
[ -n "$STALE_CATALOG" ] && { echo "sync-counts: STALE api-catalog remains:"; echo "$STALE_CATALOG"; FAIL=1; }
[ "$SERVER_CARD_LEN" != "$TOOLS" ] && { echo "sync-counts: server-card.json has $SERVER_CARD_LEN tools, DB says $TOOLS"; FAIL=1; }
[ -n "$STALE_SYSMON" ] && { echo "sync-counts: STALE sys-monitor bar(s) remain:"; echo "$STALE_SYSMON"; FAIL=1; }
[ -n "$STALE_FOOTER_TOOLS" ] && { echo "sync-counts: STALE footer 'TOOLS: N' remain:"; echo "$STALE_FOOTER_TOOLS"; FAIL=1; }
[ -n "$STALE_README_PROSE" ] && { echo "sync-counts: STALE README prose remains:"; echo "$STALE_README_PROSE"; FAIL=1; }
[ -n "$STALE_README_NUMBERS" ] && { echo "sync-counts: README.md has a number+tool/provider/schema/categor/integration/registr/stage/container phrase that isn't the two covered forms:"; echo "$STALE_README_NUMBERS"; FAIL=1; }
[ -n "$STALE_README_BADGE_NUM" ] && { echo "sync-counts: README.md has a shields.io badge with a hand-typed number remaining:"; echo "$STALE_README_BADGE_NUM"; FAIL=1; }
[ -n "$STALE_STAGE_COUNT" ] && { echo "sync-counts: STALE stage-count number in static/*.md or agent-skills/*.md (remove the number, don't update it):"; echo "$STALE_STAGE_COUNT"; FAIL=1; }
[ -n "$STALE_SITEMAP" ] && { echo "sync-counts: STALE static/sitemap.xml — differs from the generated URL set:"; echo "$STALE_SITEMAP"; FAIL=1; }
[ -n "$STALE_DISCOVERY" ] && { echo "sync-counts: STALE discovery surface(s) remain:"; echo "$STALE_DISCOVERY"; FAIL=1; }
[ -n "$STALE_POSITIONING" ] && { echo "sync-counts: STALE_POSITIONING — canonical sentence disagrees with baseline:"; echo "$STALE_POSITIONING"; FAIL=1; }
[ -n "$STALE_FORBIDDEN_POSITIONING" ] && { echo "sync-counts: STALE_FORBIDDEN_POSITIONING — banned unshipped-capability phrase found:"; echo "$STALE_FORBIDDEN_POSITIONING"; FAIL=1; }
[ -n "$STALE_ROADMAP" ] && { echo "sync-counts: STALE_ROADMAP — docs/ROADMAP.md format/SHA/freshness violation(s):"; echo "$STALE_ROADMAP"; FAIL=1; }
if [ "$CHECK" = "1" ]; then
  [ "$GEN_DISCOVERY_CHECK_RC" != "0" ] && { echo "sync-counts: STALE — gen-discovery.ts --check found byte-for-byte drift:"; echo "$GEN_DISCOVERY_CHECK_OUT"; FAIL=1; }
  [ "$GEN_OPENAPI_CHECK_RC" != "0" ] && { echo "sync-counts: STALE — generate-openapi.ts --check found byte-for-byte drift:"; echo "$GEN_OPENAPI_CHECK_OUT"; FAIL=1; }
fi

if [ "$FAIL" = "0" ]; then
  if [ "$CHECK" = "1" ]; then
    echo "sync-counts: OK (--check, 0 drift) — ai.txt/llms.txt/api-catalog/server-card.json all agree on the $TOOLS tools / $PROV providers baseline, live DB within ${FRESHNESS_TOLERANCE_PCT}% of it"
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
