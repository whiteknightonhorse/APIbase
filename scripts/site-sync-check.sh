#!/usr/bin/env bash
# T-0542: cron entry point (apibase host). Runs `site-facts.py check-live` against prod and writes every
# failure as "KEY<TAB>DISPLAY" to $TL/state/site-sync.cur. The alarm is the file, not the exit status:
# this script always exits 0. fleet-check.sh reads the file through lib/site-sync.sh.
# T-0576: the file is built in site-sync.cur.tmp and moved over site-sync.cur in one mv -f at the end, so a
# reader never sees a half-written file (the old `: >` first, appended for minutes, made fleet-check
# resolve every key at 06:30 and re-announce them at 06:45).
#
#   KEY shapes (no changing number in a key; the value lives in DISPLAY):
#     DOCS:drift:<finding>:<surface-slug>       a claims row no longer matches the facts
#     DOCS:page:<path>:<field>   DOCS:link:3xx:<host>   DOCS:genlayer:<which>:no-code
#     DOCS:agentready:<check>                   crawl, link, chain and agent-ready findings
#     DOCS:checker-failed                       site-facts.py did not finish (an empty file must not mean green)
#
# Cron line (dispatcher installs it, the card does not):
#   30 6 * * * /home/apibase/apibase-fleet/scripts/site-sync-check.sh >> /home/apibase/taskloop/logs/site-sync.cron.log 2>&1
# No model call anywhere.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TL="${TASKLOOP_HOME:-$HOME/taskloop}"
CUR="$TL/state/site-sync.cur"
TMP="$CUR.tmp"
LOG="$TL/logs/site-sync.log"
mkdir -p "$TL/state" "$TL/logs"
: > "$TMP"

OUT="$(python3 -I "${SITE_FACTS_PY:-$ROOT/scripts/site-facts.py}" check-live --root "$ROOT" \
  ${SITE_BASE:+--base "$SITE_BASE"} ${SITE_PROVEK:+--provek "$SITE_PROVEK"} 2>&1)"

printf '%s\n' "$OUT" | awk '
  function slug(s) { s = tolower(s); gsub(/[^a-z0-9]+/, "-", s); gsub(/^-+|-+$/, "", s); return s }
  /^STALE_SITE_FACTS / {
    finding = $2; surface = $3; sub(/:$/, "", surface)
    key = "DOCS:drift:" finding ":" slug(surface)
    line = $0; sub(/^STALE_SITE_FACTS [^ ]+ /, "", line); gsub(/\t/, " ", line)
    if (key in disp) disp[key] = disp[key] " | " line; else { disp[key] = line; order[++n] = key }
    next
  }
  /^DOCS:/ {
    key = $1; line = $0; sub(/^[^ ]+ ?/, "", line); gsub(/\t/, " ", line)
    if (key in disp) disp[key] = disp[key] " | " line; else { disp[key] = line; order[++n] = key }
    next
  }
  END { for (i = 1; i <= n; i++) printf "%s\t%s\n", order[i], disp[order[i]] }
' >> "$TMP"

SUMMARY="$(printf '%s\n' "$OUT" | grep -E '^site-facts: [0-9]+ failures' | tail -1)"
if [ -z "$SUMMARY" ]; then
  LAST="$(printf '%s\n' "$OUT" | tail -1 | tr '\t' ' ' | cut -c1-200)"
  printf 'DOCS:checker-failed\tsite-facts.py check-live did not finish: %s\n' "$LAST" >> "$TMP"
  SUMMARY="site-facts: checker did not finish"
fi
printf '%s %s; keys=%s\n' "$(date -u +%FT%TZ)" "$SUMMARY" "$(wc -l < "$TMP")" >> "$LOG"
mv -f "$TMP" "$CUR"
exit 0
