#!/bin/sh
# T-0854 (FLEET-REBOOT-1115 ruling-1): commit-msg guard. POSIX sh only (husky runs hooks with `sh -e`).
# Argument 1 = commit message file. The engine exports FLEET_COMMIT_PREFIXES (e.g. "T-0849" or
# "T-0415 T-SITE-F5") into the executor session (T-0852). Unset or empty = not a fleet commit: pass.
[ -n "${FLEET_COMMIT_PREFIXES:-}" ] || exit 0
msgfile="${1:-}"
[ -n "$msgfile" ] && [ -r "$msgfile" ] || exit 0

subject=""
while IFS= read -r l || [ -n "$l" ]; do
  case "$l" in
    "" | "#"*) continue ;;
  esac
  subject="$l"
  break
done < "$msgfile"

first=""
for p in $FLEET_COMMIT_PREFIXES; do
  [ -n "$first" ] || first="$p"
  case "$subject" in
    "$p"*)
      rest="${subject#"$p"}"
      next=$(printf '%s' "$rest" | cut -c1)
      case "$next" in
        [A-Za-z0-9]) ;;
        *) exit 0 ;;
      esac
      ;;
  esac
done

subj80=$(printf '%s' "$subject" | cut -c1-80)
{
  echo "BLOCKED: commit subject \"$subj80\" does not start with $first: (allowed: $FLEET_COMMIT_PREFIXES)."
  echo "         A fleet commit without its card prefix gets no verdict and stops promotion (FLEET-REBOOT-1115)."
  echo "         Use: git commit -m \"$first: <subject>\". For a revert keep the line \"This reverts commit <sha>\" in the body."
} >&2
exit 1
