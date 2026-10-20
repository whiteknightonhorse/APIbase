#!/bin/bash
# T-0467: after T-0461 only commits named on a line-initial "ACCEPTED-COMMITS:" in a
# ~/taskloop/disputes/*.closed.md ledger file are promoted. sync-counts-cron commits are
# code-generated (no reviewer), so the cron records its own acceptance after a successful push.
# Same field shape as lib/rejected-commits.sh in taskloop reads. Several runs a day share one file.
# Usage: counts_ledger_append <full-40-hex-sha>   (call only after a successful push)
counts_ledger_append() {
  local sha="$1" dir f
  case "$sha" in *[!0-9a-f]*|"") return 1 ;; esac
  [ "${#sha}" = 40 ] || return 1
  dir="${COUNTS_LEDGER_DIR:-$HOME/taskloop/disputes}"
  mkdir -p "$dir" || return 1
  f="$dir/COUNTS-$(date -u +%Y%m%d).closed.md"
  {
    printf 'ACCEPTED-BY: sync-counts-cron (code-generated counts, T-0461)\n'
    printf 'ACCEPTED-AT: %s\n' "$(date -u +%FT%TZ)"
    printf 'ACCEPTED-COMMITS: %s\n\n' "$sha"
  } >> "$f"
}
