#!/bin/bash
# T-0579: update Claude Code into a versioned prefix and switch it by one atomic symlink swap.
# Never uses sudo and never touches /usr/local/bin/claude, so callers (taskloop, pseo,
# orchestra) never see a moment without a binary. Refuses while a card is active or a tick
# lock is held; cron retries on the next run.
#
#   claude-update.sh           update to the latest (or $CLAUDE_PIN) version
#   claude-update.sh --check   print current/latest versions only, change nothing
#
# Env: CLAUDE_PIN=<ver> pin a version; CLAUDE_HOME (default ~/.local/claude);
#      TASKLOOP_DIR (default ~/taskloop); CLAUDE_UPDATE_LOG (default ~/claude-update-global.log);
#      CLAUDE_KEEP (default 2 previous versions kept besides the current one).
set -u

CH="${CLAUDE_HOME:-$HOME/.local/claude}"
TL="${TASKLOOP_DIR:-$HOME/taskloop}"
LOG="${CLAUDE_UPDATE_LOG:-$HOME/claude-update-global.log}"
KEEP="${CLAUDE_KEEP:-2}"
PKG="@anthropic-ai/claude-code"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

ts() { date -u +%FT%TZ; }
say() { printf '%s %s\n' "$(ts)" "$*"; }
logline() { printf '%s %s\n' "$(ts)" "$*" >> "$LOG" 2>/dev/null; say "$*"; }

cur=""
[ -f "$CH/current/version" ] && cur=$(head -1 "$CH/current/version" | tr -cd '0-9A-Za-z.+-')
[ -n "$cur" ] || cur="none"

target="${CLAUDE_PIN:-}"
if [ -z "$target" ]; then
  target=$(npm view "$PKG" version 2>/dev/null | tail -1 | tr -cd '0-9A-Za-z.+-')
fi
[ -n "$target" ] || { say "ERROR: cannot resolve target version from npm"; exit 1; }

nodev=$(node -v 2>/dev/null || echo none)
nodemaj=$(printf '%s' "$nodev" | sed -n 's/^v\([0-9]*\)\..*/\1/p')
if [ -z "$nodemaj" ] || [ "$nodemaj" -lt 22 ]; then
  logline "WARN: node $nodev is below the required 22; not installing node"
fi

if [ "$CHECK" = 1 ]; then
  say "current=$cur latest=$target node=$nodev"
  exit 0
fi

[ "$cur" = "$target" ] && exit 0

# Busy test: any entry in active/ or a held tick lock (flock on state/tick.lock).
busy() {
  if [ -d "$TL/active" ] && [ -n "$(ls -A "$TL/active" 2>/dev/null)" ]; then
    echo "a card is active"; return 0
  fi
  if [ -e "$TL/state/tick.lock" ]; then
    if ! ( flock -n 8 ) 8<"$TL/state/tick.lock" 2>/dev/null; then
      echo "tick lock held"; return 0
    fi
  fi
  return 1
}

if why=$(busy); then
  logline "SKIP $cur -> $target: $why, retry next run"
  exit 0
fi

mkdir -p "$CH" || exit 1
dest="$CH/$target"
if [ ! -x "$dest/bin/claude" ]; then
  rm -rf "$dest"
  mkdir -p "$dest" || exit 1
  if ! npm install --silent --no-audit --no-fund --prefix "$dest" "$PKG@$target" >/dev/null 2>&1; then
    logline "ERROR: npm install $PKG@$target failed; $cur kept"
    rm -rf "$dest"; exit 1
  fi
  mkdir -p "$dest/bin"
  ln -sfn ../node_modules/.bin/claude "$dest/bin/claude"
  if ! "$dest/bin/claude" --version >/dev/null 2>&1; then
    logline "ERROR: smoke test of $target failed; $cur kept"
    rm -rf "$dest"; exit 1
  fi
  printf '%s\n' "$target" > "$dest/version"
fi

# Re-check right before the swap, holding the tick lock so no tick starts mid-swap.
if [ -e "$TL/state/tick.lock" ]; then
  exec 8<"$TL/state/tick.lock"
  if ! flock -n 8; then
    logline "SKIP $cur -> $target: tick lock held, retry next run"; exit 0
  fi
fi
if [ -n "$(ls -A "$TL/active" 2>/dev/null)" ]; then
  logline "SKIP $cur -> $target: a card is active, retry next run"; exit 0
fi

ln -sfn "$dest" "$CH/current.new"
if ! mv -Tf "$CH/current.new" "$CH/current"; then
  logline "ERROR: symlink swap failed; $cur kept"; exit 1
fi
logline "$cur -> $target"

# Keep the current version plus $KEEP previous ones (newest by mtime).
n=0
while IFS= read -r d; do
  [ -f "$d/version" ] || continue
  [ "$d" = "$(readlink -f "$CH/current")" ] && continue
  n=$((n+1))
  [ "$n" -gt "$KEEP" ] && rm -rf "$d"
done < <(find "$CH" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
exit 0
