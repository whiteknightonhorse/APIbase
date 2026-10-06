#!/bin/bash
# scripts/lib/deploy-lock.sh -- T-0289 (INT-46 ruling q-2; 0153 s3, 0232 s1)
# Refuses a deploy whose range contains a held REJECTED commit. Source this file; do not execute.

# deploy_lock_check NEW_SHA DISPUTES_DIR LIB_PATH REPO [BASE_SHA]
# Prints "<sha40>\t<ruling basename>" for the first held commit that is an ancestor of NEW_SHA
# and has no "This reverts commit <sha40>" in <sha>..NEW_SHA, and returns 2.
# Returns 7 (prints nothing) when LIB_PATH is unreadable, 0 when nothing blocks the deploy.
# BASE_SHA (optional, T-0296): last successfully deployed commit. When it is a 40-hex SHA that exists
# in REPO and is an ancestor of NEW_SHA, held commits that are already ancestors of BASE_SHA are
# skipped (already in production, the business of the revert flow). Otherwise the full ancestry of
# NEW_SHA is checked (fail-closed) and one line is written to stderr.
# No side effects: read-only git, nothing written.
deploy_lock_check() {
  local new_sha="$1" disputes="$2" lib="$3" repo="$4" sha ruling body held base_sha="${5:-}" use_base=0
  [ -r "$lib" ] || return 7
  # shellcheck source=/dev/null
  source "$lib" || return 7
  declare -F rejected_commits_held >/dev/null || return 7
  held=$(rejected_commits_held "$disputes") || return 7
  if [[ "$base_sha" =~ ^[0-9a-f]{40}$ ]] \
    && git -C "$repo" cat-file -e "${base_sha}^{commit}" 2>/dev/null \
    && git -C "$repo" merge-base --is-ancestor "$base_sha" "$new_sha" 2>/dev/null; then
    use_base=1
  elif [ "$#" -ge 5 ]; then
    echo "deploy_lock_check: base '$base_sha' unusable, checking full ancestry of $new_sha" >&2
  fi
  while IFS=$'\t' read -r sha ruling; do
    [ -n "$sha" ] || continue
    git -C "$repo" merge-base --is-ancestor "$sha" "$new_sha" 2>/dev/null || continue
    if [ "$use_base" = 1 ] && git -C "$repo" merge-base --is-ancestor "$sha" "$base_sha" 2>/dev/null; then
      continue
    fi
    body=$(git -C "$repo" log "$sha..$new_sha" --format=%B 2>/dev/null) || body=""
    case "$body" in
      *"This reverts commit $sha"*) continue ;;
    esac
    printf '%s\t%s\n' "$sha" "$ruling"
    return 2
  done <<< "$held"
  return 0
}
