#!/bin/bash
# T-0578: shared tree-hygiene helpers (sourced by sync-counts-cron.sh and taskloop.sh).
# Each function takes the name of a log function as $1 and runs in the current git worktree.

# A formatter (lint-staged/prettier) can leave a path staged AND modified (`MM`) whose net diff
# against HEAD is empty: index and worktree cancel out. `git reset -q -- <path>` puts the index
# back at HEAD; the worktree already equals HEAD, so nothing is lost. Any other dirt is untouched.
tree_clear_mm_pairs() {
  local logfn="$1" line path
  while IFS= read -r line; do
    [ "${line:0:2}" = "MM" ] || continue
    path="${line:3}"
    case "$path" in *' -> '*|\"*) continue ;; esac
    if git diff HEAD --quiet -- "$path"; then
      git reset -q -- "$path" && "$logfn" "cleared formatter pair: $path"
    fi
  done < <(git status --porcelain)
  return 0
}

# Drop stash@{0} only when it is lint-staged's own automatic backup and holds no change.
tree_clear_empty_lint_stash() {
  local logfn="$1" msg
  msg="$(git stash list -1 --format='%gs' 2>/dev/null)"
  case "$msg" in *'lint-staged automatic backup'*) ;; *) return 0 ;; esac
  if git diff --quiet 'stash@{0}^1' 'stash@{0}' 2>/dev/null; then
    git stash drop -q 'stash@{0}' && "$logfn" "dropped empty stash: lint-staged automatic backup"
  fi
  return 0
}

# True when `git status --porcelain` is empty or lists only MM pairs with an empty net diff.
tree_only_empty_mm_pairs() {
  local line path
  while IFS= read -r line; do
    [ "${line:0:2}" = "MM" ] || return 1
    path="${line:3}"
    git diff HEAD --quiet -- "$path" || return 1
  done < <(git status --porcelain)
  return 0
}
