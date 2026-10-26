#!/bin/bash
# T-0578: PreToolUse hook for Bash. Claude Code passes the tool call as JSON on stdin; the old
# inline hook read $TOOL_INPUT, which is never set, so it never fired. lib/bash-guard.sh in
# ~/taskloop only covers the taskloop sandbox, not interactive sessions, so this hook is kept.
# Exit 2 + stderr = block. Needs jq; without jq or with unparsable input it blocks (fail closed).
# Wiring (.claude/settings.json, PreToolUse/Bash):
#   "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/hooks/bash-pretool-guard.sh"
set -u
WORKTREE="${CLAUDE_PROJECT_DIR:-$(pwd)}"
INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -er '.tool_input.command' 2>/dev/null)" \
  || { echo "BLOCKED: guard hook cannot parse its stdin JSON" >&2; exit 2; }

case "$CMD" in
  *'git push --force'*|*'git reset --hard'*|*'chmod 777'*|*'chmod -R 777'*|*'curl | bash'*|*'wget | bash'*)
    echo "BLOCKED: dangerous command" >&2; exit 2 ;;
esac

# rm -rf / rm -fr / rm -r -f: every rm segment, every target must resolve inside the worktree
# (or strictly under /tmp/ or /var/tmp/). Variables, command substitution and a preceding cd make a
# target unresolvable, so those are blocked.
RMRE='(^|[;&|[:space:]])rm[[:space:]]+(-[a-zA-Z]*[rR][a-zA-Z]*[[:space:]]+-[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*[[:space:]]+-[a-zA-Z]*[rR]|-[a-zA-Z]*([rR][a-zA-Z]*f|f[a-zA-Z]*[rR]))'
if printf '%s' "$CMD" | grep -qE "$RMRE"; then
  HAS_CD=0
  case "$CMD" in *'cd '*|*pushd\ *) HAS_CD=1 ;; esac
  while IFS= read -r seg; do
    printf '%s' "$seg" | grep -qE "$RMRE" || continue
    seg="$(printf '%s' "$seg" | sed -E 's/^.*(^|[[:space:]])rm[[:space:]]+//')"
    for tok in $(printf '%s' "$seg" | tr ' ' '\n' | grep -v '^-'); do
      tok="${tok//[\'\"]/}"
      case "$tok" in ''|'&&'|'||'|';'|'|') break ;; esac
      case "$tok" in
        *'$'*|*'`'*) echo "BLOCKED: rm -rf target is not a literal path" >&2; exit 2 ;;
      esac
      case "$tok" in
        /*) abs="$tok" ;;
        '~'*) abs="$HOME${tok#\~}" ;;
        *) if [ "$HAS_CD" = 1 ]; then echo "BLOCKED: rm -rf target is not a literal path" >&2; exit 2; fi
           abs="$WORKTREE/$tok" ;;
      esac
      abs="$(realpath -m -- "$abs")"
      case "$abs" in
        "$WORKTREE") echo "BLOCKED: rm -rf of the worktree root" >&2; exit 2 ;;
        "$WORKTREE"/*|/tmp/?*|/var/tmp/?*) ;;
        *) echo "BLOCKED: rm -rf outside the worktree ($abs)" >&2; exit 2 ;;
      esac
    done
  done < <(printf '%s\n' "$CMD" | sed -E 's/(;|&&|\|\||\|)/\n/g')
fi
exit 0
