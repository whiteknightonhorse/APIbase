#!/usr/bin/env bash
# check-external-listings.sh — compare the live tool count against external showcases
# (MCP directories, etc.) where APIbase is listed, using ONLY public pages that need no
# credentials of ours. Read-only, always: never writes to this repo or to any third
# party's site. A mismatch found here can only be FIXED by a human editing the third
# party's own UI (see docs/OPERATOR-ACTION-smithery-listing-description.md) -- so this
# is deliberately NOT part of promote_staging.sh's required-check set, same reasoning
# as sync-counts.sh itself (F9): it reflects a THIRD PARTY's cached state, not anything
# about the commit under test. Blocking promotion on a defect no commit here can fix
# would just wedge the pipeline forever.
#
# Found 2026-09-02: Smithery's public listing carried "95 tools" while live was 1316 --
# a 14x understatement, live since Mar 12 2026. Root-caused live: `smithery mcp publish`
# correctly re-scans our server-card.json every time (confirmed: deploy log showed
# "server card: 1316 tools" on the SAME run that left the page's prose untouched) but its
# free-text "description" field is metadata Smithery sets ONCE at first publish and
# refuses to overwrite on republish (`[metadata] Metadata already set` in the CLI output)
# -- so it can drift arbitrarily far with zero code-side signal. This check is the signal.
set -uo pipefail
ROOT="${ROOT:-/home/apibase/apibase}"; cd "$ROOT"

TOOLS=$(docker exec apibase-postgres-1 psql -U apibase -d apibase -tAc \
  "select count(*) from tools where status != 'unavailable'")
[ -n "$TOOLS" ] || { echo "check-external-listings: failed to read live tool count from DB"; exit 1; }
echo "check-external-listings: live truth = $TOOLS tools"

FAIL=0

# --- Smithery.ai — public server page, no API key (this is what any visitor/searcher sees) ---
SMITHERY_HTML=$(curl -s -A "Mozilla/5.0 (compatible; apibase-listing-check/1.0)" --max-time 15 \
  "https://smithery.ai/servers/apibase-pro/api-hub" || true)
if [ -z "$SMITHERY_HTML" ]; then
  echo "check-external-listings: Smithery page unreachable (network/rate-limit) — not counted as drift this run"
else
  SMITHERY_N=$(echo "$SMITHERY_HTML" | grep -oE '[0-9]+ tools across' | head -1 | grep -oE '^[0-9]+' || true)
  if [ -z "$SMITHERY_N" ]; then
    echo "check-external-listings: WARN — could not find a 'N tools across' phrase on the Smithery page; page shape may have changed, inspect manually"
  elif [ "$SMITHERY_N" != "$TOOLS" ]; then
    echo "check-external-listings: DRIFT — Smithery listing says '$SMITHERY_N tools', live DB says $TOOLS."
    echo "  Not fixable from this repo (see docs/OPERATOR-ACTION-smithery-listing-description.md)."
    FAIL=1
  else
    echo "check-external-listings: Smithery OK ($SMITHERY_N tools, matches live)"
  fi
fi

# --- Glama.ai — deliberately not checked here: it runs tools/list LIVE through our own
# MCP server on every inspection (.claude/skills/glama/SKILL.md), so it has no cached
# prose to drift out from under us; live-verified 2026-09-02 showing "1316 tools" correctly.

exit $FAIL
