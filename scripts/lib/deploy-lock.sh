#!/bin/bash
# scripts/lib/deploy-lock.sh -- T-0289 (INT-46 ruling q-2; 0153 s3, 0232 s1)
# Refuses a deploy whose range contains a held REJECTED commit. Source this file; do not execute.

# deploy_lock_check NEW_SHA DISPUTES_DIR LIB_PATH REPO
# Prints "<sha40>\t<ruling basename>" for the first held commit that is an ancestor of NEW_SHA
# and has no "This reverts commit <sha40>" in <sha>..NEW_SHA, and returns 2.
# Returns 7 (prints nothing) when LIB_PATH is unreadable, 0 when nothing blocks the deploy.
# No side effects: read-only git, nothing written.
deploy_lock_check() {
  local new_sha="$1" disputes="$2" lib="$3" repo="$4" sha ruling body held
  [ -r "$lib" ] || return 7
  # shellcheck source=/dev/null
  source "$lib" || return 7
  declare -F rejected_commits_held >/dev/null || return 7
  held=$(rejected_commits_held "$disputes") || return 7
  while IFS=$'\t' read -r sha ruling; do
    [ -n "$sha" ] || continue
    git -C "$repo" merge-base --is-ancestor "$sha" "$new_sha" 2>/dev/null || continue
    body=$(git -C "$repo" log "$sha..$new_sha" --format=%B 2>/dev/null) || body=""
    case "$body" in
      *"This reverts commit $sha"*) continue ;;
    esac
    printf '%s\t%s\n' "$sha" "$ruling"
    return 2
  done <<< "$held"
  return 0
}
