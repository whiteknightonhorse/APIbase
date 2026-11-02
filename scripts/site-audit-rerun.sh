#!/bin/bash
# T-0543 (SITE-AUDIT-1026 item 3): the operator's site re-audit in one command.
# Runs check-live (claims + pages-to-monitor crawl), check-page-meta.sh (fetch mode against prod),
# check-external-listings.sh (advisory), and the tester phases P0+P24+P26 with SKIP_PAYMENTS=true;
# writes ~/taskloop/briefs/site-audit/<date>/summary.md with the counts per section.
# Cron (monthly):  0 7 1 * *  cd /home/apibase/apibase-fleet && bash scripts/site-audit-rerun.sh
# Env: BASE (default https://apibase.pro), OUT_DIR, TESTER_DIR (default ~/mcp-protocol-tester).
# Exit 0 always when the summary was written; drift is reported in the summary, not the exit code.
set -uo pipefail
ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
BASE="${BASE:-https://apibase.pro}"
TESTER_DIR="${TESTER_DIR:-$HOME/mcp-protocol-tester}"
DAY="$(date -u +%F)"
OUT_DIR="${OUT_DIR:-$HOME/taskloop/briefs/site-audit/$DAY}"
mkdir -p "$OUT_DIR"

run() { # run <name> <cmd...>; raw output to $OUT_DIR/<name>.log, rc to $OUT_DIR/<name>.rc
  local n="$1"; shift
  "$@" >"$OUT_DIR/$n.log" 2>&1; echo $? >"$OUT_DIR/$n.rc"
}
count() { grep -c "$1" "$OUT_DIR/$2.log" 2>/dev/null || true; }

run check-live python3 -I scripts/site-facts.py check-live --base "$BASE"
run page-meta env PAGE_META_BASE="$BASE" ROOT="$ROOT" bash scripts/check-page-meta.sh
run external-listings bash scripts/check-external-listings.sh
if [ -d "$TESTER_DIR" ]; then
  run tester bash -c "cd '$TESTER_DIR' && SKIP_PAYMENTS=true PHASES=0,24,26 node --max-old-space-size=512 src/index.js"
else
  echo "tester dir $TESTER_DIR missing" >"$OUT_DIR/tester.log"; echo 127 >"$OUT_DIR/tester.rc"
fi

{
  echo "# Site re-audit $DAY"
  echo
  echo "Base: $BASE. Raw logs next to this file. Drift is the number SITE-AUDIT-1026 item 3 tracks (target 0)."
  echo
  echo "| Section | rc | Count |"
  echo "|---|---|---|"
  echo "| check-live: DOCS:drift lines | $(cat "$OUT_DIR/check-live.rc") | $(count 'DOCS:drift' check-live) |"
  echo "| check-live: STALE_SITE_FACTS lines | - | $(count 'STALE_SITE_FACTS' check-live) |"
  echo "| check-live: summary | - | $(grep -E '^site-facts: [0-9]+ failures' "$OUT_DIR/check-live.log" | tail -1) |"
  echo "| check-page-meta: summary | $(cat "$OUT_DIR/page-meta.rc") | $(grep -E 'failures = ' "$OUT_DIR/page-meta.log" | tail -1) |"
  echo "| check-external-listings (advisory): listings printed | $(cat "$OUT_DIR/external-listings.rc") | $(grep -c '^{' "$OUT_DIR/external-listings.log" 2>/dev/null || true) |"
  echo "| tester P0+P24+P26 (SKIP_PAYMENTS=true): FAIL lines | $(cat "$OUT_DIR/tester.rc") | $(grep -c '\[FAIL' "$OUT_DIR/tester.log" 2>/dev/null || true) |"
  echo
  echo "## check-live tail"
  echo '```'; tail -n 15 "$OUT_DIR/check-live.log"; echo '```'
} >"$OUT_DIR/summary.md"
echo "site-audit-rerun: wrote $OUT_DIR/summary.md"
