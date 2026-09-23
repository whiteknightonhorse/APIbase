#!/usr/bin/env bash
# check-external-listings.sh — read-only detector for third-party listings whose CACHED
# description text can drift from live truth (Smithery, Official MCP Registry, npm,
# Glama-health, PulseMCP; add more the same way, same JSON-line-per-listing contract).
# Runs over SSH on the production server (needs `docker exec` into postgres for live
# truth) and prints ONE JSON object per listing to stdout — consumed by the "External
# listings (advisory)" CI job on the Actions runner, which owns the GitHub-side effects
# (::warning:: annotations, job summary, tracking issue) since gh/GITHUB_TOKEN belong on
# the runner, not the production box.
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
#   operator-declined -> never blocking, not checked by this script at all (a human
#                    declined the fix on purpose, e.g. glama_server_listing — see that
#                    entry's note in docs/external-drift.json). classify()'s blocking
#                    formula below only ever sets blk=1 for repo-fixable or aged-out
#                    operator-only, so this classification is a no-op for blocking by
#                    construction, same as any classification string it doesn't recognize.
#
# `resolved` field (docs/external-drift.json, per-entry, optional): once an operator-only
# defect is actually fixed, set `resolved` to that date instead of deleting the entry.
# classify() below resets the 30-day clock to age=0 the moment `resolved` is present and
# >= first_seen — first_seen stays as a historical record of when the clock originally
# started, `resolved` is what the age math actually reads. If the SAME listing regresses
# later despite a `resolved` date sitting in the file, that resolved date is stale and
# must not keep resetting the clock forever — see the "recurred after resolved" note the
# script emits in that case; the fix is to commit a fresh first_seen for the regression.
#
# Smithery-specific rule (Q2.3): once the listing's free-text description carries NO
# tool-count number at all, this is treated as "no drift", permanently — a description
# rewritten without a number (see docs/OPERATOR-ACTION-smithery-listing-description.md's
# suggested replacement text) can never rot again the way "95 tools" did.
#
# ZZ-03-10 (D-2/R1+R2): Official MCP Registry (server.json) and npm (packages/mcp-client/
# package.json) are REPO-SOURCED listings -- their description text is published FROM this
# repo, not authored independently on the third-party side the way Smithery's is. As of
# this task, both repo source strings carry NO tool/provider numbers (see git history for
# server.json / packages/mcp-client/package.json). That makes the "repo disagrees with
# itself" failure mode structurally impossible for these two going forward: any number
# still showing on the live registry page is stale CACHE waiting on a manual republish
# action (R4: npm -> Official Registry -> Glama -> Smithery, gated order, operator-run),
# not a defect this repo can fix again. Distinguished from Smithery's "drift" with its own
# status literal, "pending_republish", per the code-part acceptance criterion (dry-run must
# show pending_republish, not stale, until R4 actually runs). Tracked via docs/
# external-drift.json same as any operator-only listing (30-day escalation, see classify()).
#
# Glama-health checks the connector page's own binary Status field (Healthy/Unhealthy) --
# separate from Glama's description text, which is Official-Registry-synced and therefore
# already covered by the official_registry check above (same source string, no need to
# fetch it twice). R3 (diagnose WHY Unhealthy) is a separate future task; this check only
# establishes the FACT, tracked the same operator-only way.
#
# PulseMCP is Cloudflare-protected against server-side/CI fetches (confirmed repeatedly,
# every UA tried, both the HTML page and the documented v0.1 API which additionally requires
# an API key this repo does not hold -- the older v0beta API is fully sunset as of September
# 2026). "unreachable" is therefore the expected, honest steady-state result here, same
# graceful-degrade the Smithery check already used before this listing existed -- NOT a
# signal to keep retrying with new headers. R6 (operator checks PulseMCP status by hand,
# 7 days after R4, then drafts outreach if still wrong) covers what this script cannot.
set -uo pipefail
ROOT="${ROOT:-/home/apibase/apibase}"; cd "$ROOT"
DRIFT_JSON="docs/external-drift.json"
TODAY="${TODAY:-$(date -u +%F)}"

TOOLS=$(docker exec apibase-postgres-1 psql -U apibase -d apibase -tAc \
  "select count(*) from tools where status != 'unavailable'")
[ -n "$TOOLS" ] || { echo "{\"error\":\"failed to read live tool count from DB\"}"; exit 1; }

classify() {
  # arg: listing_key -> prints "classification|first_seen|age_days|blocking(0/1)"
  # If the entry has a `resolved` date >= first_seen, the clock resets: fs becomes today
  # and age=0, so a fixed operator-only defect doesn't sit there accruing age toward the
  # 30-day blocking threshold off its original first_seen forever.
  python3 - "$1" "$DRIFT_JSON" "$TODAY" <<'PYEOF'
import json, os, sys
from datetime import date

key, path, today = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(path)) if os.path.exists(path) else {}
entry = d.get(key, {})
cls = entry.get("classification", "operator-only")
fs = entry.get("first_seen", today)
resolved = entry.get("resolved")
if resolved and resolved >= fs:
    fs = today
    age = 0
else:
    age = (date.fromisoformat(today) - date.fromisoformat(fs)).days
blk = 1 if (cls == "repo-fixable" or (cls == "operator-only" and age > 30)) else 0
print(f"{cls}|{fs}|{age}|{blk}")
PYEOF
}

# arg: listing_key -> prints a "recurred after resolved <date>; commit a new first_seen"
# note IF the entry has a `resolved` date but the caller is emitting this listing as
# currently non-ok anyway (i.e. the resolved fix didn't stick) — empty otherwise. Kept
# separate from classify() so classify()'s own pipe-delimited output format never grows
# an optional trailing field.
resolved_note() {
  python3 - "$1" "$DRIFT_JSON" <<'PYEOF'
import json, os, sys

key, path = sys.argv[1], sys.argv[2]
d = json.load(open(path)) if os.path.exists(path) else {}
entry = d.get(key, {})
resolved = entry.get("resolved")
fs = entry.get("first_seen")
if resolved and fs and resolved >= fs:
    print(f"recurred after resolved {resolved}; commit a new first_seen")
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

# --- shared: extract the first "<N> tool(s)" style count out of a free-text description,
# "" if none found (e.g. "300+ tools", "327 tools,", "1380 tools from" all match). ---
extract_tool_count() {
  echo "$1" | grep -oiE '[0-9]+\+?[[:space:]]*tools?' | head -1 | grep -oE '^[0-9]+' || true
}

# --- shared: emit the JSON line for a repo-sourced listing (Official Registry, npm) given
# its listing key and the live description text fetched from the third party. Optional third
# arg is a second free-text field (npm's "readme", which registry.npmjs.org serves on the
# package page independently of "description" — a stale count there is just as much a lie as
# one in the description, so it gets the same extractor, same verdict). See the ZZ-03-10
# header comment above for why these use "pending_republish" instead of "drift". ---
emit_repo_synced_listing() {
  local key="$1" desc="$2" extra="${3:-}"
  local n; n=$(extract_tool_count "$desc")
  local n2=""; [ -n "$extra" ] && n2=$(extract_tool_count "$extra")
  local mismatch=""
  [ -n "$n" ] && [ "$n" != "$TOOLS" ] && mismatch="$n"
  [ -z "$mismatch" ] && [ -n "$n2" ] && [ "$n2" != "$TOOLS" ] && mismatch="$n2"
  if [ -n "$mismatch" ]; then
    local cls fs age blk
    IFS='|' read -r cls fs age blk < <(classify "$key")
    [ "$blk" = "1" ] && BLOCKING=1
    local blk_json; blk_json=$( [ "$blk" = "1" ] && echo true || echo false )
    echo "{\"listing\":\"$key\",\"status\":\"pending_republish\",\"listing_value\":\"$mismatch tools\",\"live_tools\":$TOOLS,\"classification\":\"$cls\",\"first_seen\":\"$fs\",\"age_days\":$age,\"blocking\":$blk_json}"
  elif [ -z "$n" ] && [ -z "$n2" ]; then
    echo "{\"listing\":\"$key\",\"status\":\"ok_no_number\",\"live_tools\":$TOOLS,\"blocking\":false}"
  else
    echo "{\"listing\":\"$key\",\"status\":\"ok\",\"live_tools\":$TOOLS,\"blocking\":false}"
  fi
}

# --- server.json description length — the Official MCP Registry rejects publish with a 422
# ("expected length <= 100") if description exceeds 100 chars; confirmed T-0172zzz (2026-09-23),
# a 141-char description was rejected before ever reaching the registry, so the drift checks
# below (which only read what's already live) can never catch this class of bug. This is a
# repo-only, pre-publish check: read our own server.json, always blocking since it's entirely
# fixable from this repo. ---
SERVER_JSON_CHECK=$(python3 -c '
import json
try:
    d = json.load(open("server.json"))
    n = len(d.get("description", ""))
    status = "too_long" if n > 100 else "ok"
    blocking = "true" if n > 100 else "false"
    print("{\"listing\":\"server_json_description_length\",\"status\":\"%s\",\"length\":%d,\"max\":100,\"blocking\":%s}" % (status, n, blocking))
except Exception as e:
    print("{\"listing\":\"server_json_description_length\",\"status\":\"error\",\"blocking\":false}")
')
echo "$SERVER_JSON_CHECK"
echo "$SERVER_JSON_CHECK" | grep -q '"blocking":true' && BLOCKING=1

# --- Official MCP Registry — registry.modelcontextprotocol.io, our own server.json record ---
REGISTRY_JSON=$(curl -s --max-time 15 \
  "https://registry.modelcontextprotocol.io/v0/servers?search=apibase" || true)
REGISTRY_DESC=""
[ -n "$REGISTRY_JSON" ] && REGISTRY_DESC=$(echo "$REGISTRY_JSON" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for entry in d.get("servers", []):
    meta = entry.get("_meta", {}).get("io.modelcontextprotocol.registry/official", {})
    server = entry.get("server", {})
    if meta.get("isLatest") and server.get("name") == "io.github.whiteknightonhorse/apibase":
        print(server.get("description", ""))
        break
' 2>/dev/null || true)
if [ -z "$REGISTRY_DESC" ]; then
  echo "{\"listing\":\"official_registry\",\"status\":\"unreachable\",\"blocking\":false}"
else
  emit_repo_synced_listing official_registry "$REGISTRY_DESC"
fi

# --- npm — registry.npmjs.org, apibase-mcp-client (unscoped; dual-published from the same
# packages/mcp-client/package.json alongside @apibase11/mcp-client, always kept in lockstep
# per .claude/skills/npmjs/SKILL.md, so checking one is checking both). Also pulls "readme" —
# npm renders packages/mcp-client/README.md verbatim on the package page, a separate field
# from "description" that the same registry response carries, so a stale count surviving
# there would show a clean "ok_no_number" for description while the actual page still lies. ---
NPM_JSON=$(curl -s --max-time 15 "https://registry.npmjs.org/apibase-mcp-client/latest" || true)
NPM_DESC=""; NPM_README=""
if [ -n "$NPM_JSON" ]; then
  NPM_DESC=$(echo "$NPM_JSON" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("description", ""))
except Exception:
    pass
' 2>/dev/null || true)
  NPM_README=$(echo "$NPM_JSON" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("readme", ""))
except Exception:
    pass
' 2>/dev/null || true)
fi
if [ -z "$NPM_JSON" ]; then
  echo "{\"listing\":\"npm\",\"status\":\"unreachable\",\"blocking\":false}"
else
  emit_repo_synced_listing npm "$NPM_DESC" "$NPM_README"
fi

# --- Glama-health — connector page's own binary Status field (Healthy/Unhealthy). Not a
# description-drift check (see header comment): Glama's description text is Official-
# Registry-synced and already covered above, so this only tracks the pass/fail health flag. ---
GLAMA_HTML=$(curl -s --max-time 15 \
  "https://glama.ai/mcp/connectors/io.github.whiteknightonhorse/apibase" || true)
GLAMA_STATUS=""
[ -n "$GLAMA_HTML" ] && GLAMA_STATUS=$(echo "$GLAMA_HTML" | python3 -c '
import re, sys
m = re.search(r">Status</dt>.*?<span>([A-Za-z]+)</span>", sys.stdin.read(), re.S)
print(m.group(1) if m else "")
' 2>/dev/null || true)
if [ -z "$GLAMA_STATUS" ]; then
  echo "{\"listing\":\"glama_health\",\"status\":\"unreachable\",\"blocking\":false}"
elif [ "$GLAMA_STATUS" = "Healthy" ]; then
  echo "{\"listing\":\"glama_health\",\"status\":\"ok\",\"blocking\":false}"
else
  IFS='|' read -r CLS FS AGE BLK < <(classify glama_health)
  [ "$BLK" = "1" ] && BLOCKING=1
  BLK_JSON=$( [ "$BLK" = "1" ] && echo true || echo false )
  NOTE=$(resolved_note glama_health)
  if [ -n "$NOTE" ]; then
    echo "{\"listing\":\"glama_health\",\"status\":\"unhealthy\",\"listing_value\":\"$GLAMA_STATUS\",\"classification\":\"$CLS\",\"first_seen\":\"$FS\",\"age_days\":$AGE,\"blocking\":$BLK_JSON,\"note\":\"$NOTE\"}"
  else
    echo "{\"listing\":\"glama_health\",\"status\":\"unhealthy\",\"listing_value\":\"$GLAMA_STATUS\",\"classification\":\"$CLS\",\"first_seen\":\"$FS\",\"age_days\":$AGE,\"blocking\":$BLK_JSON}"
  fi
fi

# --- PulseMCP — Cloudflare-protected against automated fetches (confirmed repeatedly, see
# header comment); "unreachable" is the expected steady state, not a bug in this check. If
# it ever DOES come through clean, flag the known-wrong template text from research so a
# future run can tell "still wrong" apart from "finally fixed". ---
PULSE_HTML=$(curl -s -A "Mozilla/5.0 (compatible; apibase-listing-check/1.0)" --max-time 15 \
  "https://www.pulsemcp.com/servers/apibase" || true)
if [ -z "$PULSE_HTML" ] || echo "$PULSE_HTML" | grep -qi "cloudflare\|attention required"; then
  echo "{\"listing\":\"pulsemcp\",\"status\":\"unreachable\",\"blocking\":false}"
elif echo "$PULSE_HTML" | grep -qi "API development platform"; then
  IFS='|' read -r CLS FS AGE BLK < <(classify pulsemcp)
  [ "$BLK" = "1" ] && BLOCKING=1
  BLK_JSON=$( [ "$BLK" = "1" ] && echo true || echo false )
  echo "{\"listing\":\"pulsemcp\",\"status\":\"wrong_content\",\"classification\":\"$CLS\",\"first_seen\":\"$FS\",\"age_days\":$AGE,\"blocking\":$BLK_JSON}"
else
  echo "{\"listing\":\"pulsemcp\",\"status\":\"ok\",\"blocking\":false}"
fi

exit $BLOCKING
