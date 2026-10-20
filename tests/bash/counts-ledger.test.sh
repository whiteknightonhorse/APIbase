#!/bin/bash
# T-0467: sync-counts-cron writes its own ACCEPTED ledger line only after a successful push.
# Runs the real push/ledger tail of the script against a fake git and a temp HOME.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
fail() { echo "FAIL: $*"; exit 1; }
export HOME="$T/home"; mkdir -p "$HOME"
SHA1=1111111111111111111111111111111111111111
SHA2=2222222222222222222222222222222222222222
F="$HOME/taskloop/disputes/COUNTS-$(date -u +%Y%m%d).closed.md"

# Extract the script tail from the commit line on, so the test uses the real wiring.
START="$(grep -n '^git commit -m "counts: sync' "$ROOT/scripts/sync-counts-cron.sh" | cut -d: -f1)"
[ -n "$START" ] || fail "commit line not found"
{
  echo 'set -euo pipefail'
  echo "HERE='$ROOT'"
  echo '. "$HERE/scripts/lib/counts-ledger.sh"'
  echo 'clog(){ echo "$*" >> "$HOME/clog"; }; calert(){ :; }'
  echo 'TOOLS=1; PROV=1; CHANGED=(a)'
  tail -n +"$START" "$ROOT/scripts/sync-counts-cron.sh"
} > "$T/tail.sh"
mkdir -p "$T/bin"
cat > "$T/bin/git" <<'G'
#!/bin/bash
case "$1" in
  commit) exit 0 ;;
  push) [ "${FAKE_PUSH_FAIL:-0}" = 1 ] && exit 1; exit 0 ;;
  rev-parse) [ "${2:-}" = "--short" ] && echo "${FAKE_SHA:0:8}" || echo "$FAKE_SHA" ;;
esac
G
chmod +x "$T/bin/git"
run() { PATH="$T/bin:$PATH" FAKE_SHA="$1" FAKE_PUSH_FAIL="${2:-0}" bash "$T/tail.sh" >/dev/null 2>&1; }

# push fails -> no ledger
run "$SHA1" 1 && fail "push failure must exit nonzero"
[ ! -e "$F" ] || fail "ledger written despite failed push"
# push ok -> one line with the SHA
run "$SHA1" || fail "push ok run failed"
[ "$(grep -c '^ACCEPTED-COMMITS: ' "$F")" = 1 ] || fail "expected 1 commits line"
grep -qx "ACCEPTED-COMMITS: $SHA1" "$F" || fail "sha missing"
grep -qx 'ACCEPTED-BY: sync-counts-cron (code-generated counts, T-0461)' "$F" || fail "ACCEPTED-BY missing"
grep -q '^ACCEPTED-AT: ' "$F" || fail "ACCEPTED-AT missing"
# second run same day -> second line, same file
run "$SHA2" || fail "second run failed"
[ "$(grep -c '^ACCEPTED-COMMITS: ' "$F")" = 2 ] || fail "expected 2 commits lines"
grep -qx "ACCEPTED-COMMITS: $SHA2" "$F" || fail "sha2 missing"
[ "$(ls "$HOME/taskloop/disputes" | wc -l)" = 1 ] || fail "more than one file"
# nothing to commit: the early-exit path precedes the commit line, so the ledger code is unreachable from it
L="$(grep -n 'nothing committed (' "$ROOT/scripts/sync-counts-cron.sh" | head -1 | cut -d: -f1)"
[ -n "$L" ] && [ "$L" -lt "$START" ] || fail "no-op exit must precede commit/ledger"
# malformed sha rejected
( . "$ROOT/scripts/lib/counts-ledger.sh"; counts_ledger_append abc ) && fail "short sha accepted"
echo "counts-ledger: all OK"
