#!/usr/bin/env bash
# check-external-listings.sh — read-only detector for third-party listings whose CACHED
# description text can drift from live truth (Smithery today; add more the same way,
# same JSON-line-per-listing contract). Runs over SSH on the production server (needs
# `docker exec` into postgres for live truth) and prints ONE JSON object per listing to
# stdout — consumed by the "External listings (advisory)" CI job on the Actions runner,
# which owns the GitHub-side effects (::warning:: annotations, job summary, tracking
# issue) since gh/GITHUB_TOKEN belong on the runner, not the production box.
#
# Exit code: 1 if ANY listing is currently classified blocking (see classify() below),
# 0 otherwise — so a bare manual run still fails loud, unchanged from before this rewrite.
#
# Ruling: T-30 dispute q-1, Q2 (disputes/30-content-seo-and-github.ruling-1.md).
# Classification (per listing, read from docs/external-drift.json, this repo's own
# checked-in first_seen ledger — nothing here writes to that file; a human/agent commits
# an entry once, this script only ever reads it):
#   repo-fixable  -> always blocking -- something in THIS repo can fix it, so a green
#                    check while it's broken would be a lie.
#   operator-only -> blocking ONLY if first_seen is >30 days old -- otherwise visible
#                    (warning + tracking issue) but not blocking; a defect no commit here
#                    can fix should not wedge the pipeline the day it's found, but SHOULD
#                    escalate if it sits ignored for a month.
#   (unknown listing, no docs/external-drift.json entry) -> defaults to operator-only,
#                    first_seen = today (the script logs it as newly discovered; add a
#                    real entry to docs/external-drift.json in a follow-up commit once
#                    triaged — every listing this script can check is by definition a
#                    third party's own cached page, "Not fixable from this repo" per the
#                    file's own long-standing comment, so operator-only is the safe
#                    default even for a brand-new listing).
#
# Smithery-specific rule (Q2.3): once the listing's free-text description carries NO
# tool-count number at all, this is treated as "no drift", permanently — a description
# rewritten without a number (see docs/OPERATOR-ACTION-smithery-listing-description.md's
# suggested replacement text) can never rot again the way "95 tools" did.
set -uo pipefail
ROOT="${ROOT:-/home/apibase/apibase}"; cd "$ROOT"
DRIFT_JSON="docs/external-drift.json"
TODAY=$(date -u +%Y-%m-%d)

TOOLS=$(docker exec apibase-postgres-1 psql -U apibase -d apibase -tAc \
  "select count(*) from tools where status != 'unavailable'")
[ -n "$TOOLS" ] || { echo "{\"error\":\"failed to read live tool count from DB\"}"; exit 1; }

classify() {
  # arg: listing_key -> prints "classification|first_seen|age_days|blocking(0/1)"
  python3 - "$1" "$DRIFT_JSON" "$TODAY" <<'PYEOF'
import json, os, sys
from datetime import date

key, path, today = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(path)) if os.path.exists(path) else {}
entry = d.get(key, {})
cls = entry.get("classification", "operator-only")
fs = entry.get("first_seen", today)
age = (date.fromisoformat(today) - date.fromisoformat(fs)).days
blk = 1 if (cls == "repo-fixable" or (cls == "operator-only" and age > 30)) else 0
print(f"{cls}|{fs}|{age}|{blk}")
PYEOF
}

BLOCKING=0

# --- Smithery.ai — public server page, no API key (what any visitor/searcher sees) ---
SMITHERY_HTML=$(curl -s -A "Mozilla/5.0 (compatible; apibase-listing-check/1.0)" --max-time 15 \
  "https://smithery.ai/servers/apibase-pro/api-hub" || true)
if [ -z "$SMITHERY_HTML" ]; then
  echo "{\"listing\":\"smithery\",\"status\":\"unreachable\",\"blocking\":false}"
else
  SMITHERY_N=$(echo "$SMITHERY_HTML" | grep -oE '[0-9]+ tools across' | head -1 | grep -oE '^[0-9]+' || true)
  if [ -z "$SMITHERY_N" ]; then
    echo "{\"listing\":\"smithery\",\"status\":\"ok_no_number\",\"live_tools\":$TOOLS,\"blocking\":false}"
  elif [ "$SMITHERY_N" != "$TOOLS" ]; then
    IFS='|' read -r CLS FS AGE BLK < <(classify smithery)
    [ "$BLK" = "1" ] && BLOCKING=1
    BLK_JSON=$( [ "$BLK" = "1" ] && echo true || echo false )
    echo "{\"listing\":\"smithery\",\"status\":\"drift\",\"listing_value\":\"$SMITHERY_N tools\",\"live_tools\":$TOOLS,\"classification\":\"$CLS\",\"first_seen\":\"$FS\",\"age_days\":$AGE,\"blocking\":$BLK_JSON}"
  else
    echo "{\"listing\":\"smithery\",\"status\":\"ok\",\"live_tools\":$TOOLS,\"blocking\":false}"
  fi
fi

# --- Glama.ai — deliberately not checked here: it runs tools/list LIVE through our own
# MCP server on every inspection (.claude/skills/glama/SKILL.md), so it has no cached
# prose to drift out from under us; live-verified 2026-09-02 showing "1316 tools" correctly.

exit $BLOCKING
