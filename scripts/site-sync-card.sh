#!/usr/bin/env bash
# T-0542: files at most 3 new docs-drift cards per UTC day from state/site-sync.cur.
#   site-sync-card.sh <curfile>
# For each DOCS:drift:<finding>:<surface-slug> key with no marker in state/site-sync/cards/<key-slug>,
# one card per surface goes to queue/98NN-docs-drift-<surface-slug>.md (NN from state/site-sync/seq) and
# a marker is dropped for every drift key of that surface. A key that disappears from the cur file loses
# its marker after 7 days (a recurrence then files a new card). Existing cards are never edited or deleted.
# Called from fleet-check.sh right after site_sync_lines. No model call.
set -u
CUR="${1:-}"
TL="${TASKLOOP_HOME:-$HOME/taskloop}"
QUEUE="$TL/queue"
ST="$TL/state/site-sync"
CARDS="$ST/cards"
SEQ="$ST/seq"
CAP="${SITE_SYNC_CARD_CAP:-3}"
GONE_S="${SITE_SYNC_MARKER_TTL_S:-604800}"
mkdir -p "$CARDS" "$QUEUE"
[ -n "$CUR" ] && [ -f "$CUR" ] || exit 0

slug() { printf '%s' "$1" | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9]\{1,\}/-/g; s/^-//; s/-$//'; }
NOW="$(date -u +%s)"
DAY="$ST/day-$(date -u +%F)"
MADE="$(cat "$DAY" 2>/dev/null || echo 0)"

# 1. Markers whose key left the cur file expire after 7 days of absence (.gone holds the first-absent time).
for m in "$CARDS"/*; do
  [ -f "$m" ] || continue
  case "$m" in *.gone) continue ;; esac
  key="$(sed -n 's/^key=//p' "$m" | head -1)"
  if grep -qF "$key"$'\t' "$CUR" 2>/dev/null; then
    rm -f "$m.gone"
  else
    [ -f "$m.gone" ] || printf '%s\n' "$NOW" > "$m.gone"
    since="$(cat "$m.gone" 2>/dev/null || echo "$NOW")"
    if [ $((NOW - since)) -ge "$GONE_S" ]; then rm -f "$m" "$m.gone"; fi
  fi
done

# 2. New cards, one per surface, capped per UTC day.
declare -A SEEN_SURFACE=()
while IFS=$'\t' read -r key display; do
  case "$key" in DOCS:drift:*) ;; *) continue ;; esac
  [ -e "$CARDS/$(slug "$key")" ] && continue
  rest="${key#DOCS:drift:}"
  surface_slug="${rest#*:}"
  [ -n "${SEEN_SURFACE[$surface_slug]:-}" ] && continue
  SEEN_SURFACE[$surface_slug]=1
  if [ "$MADE" -ge "$CAP" ]; then continue; fi

  n="$(cat "$SEQ" 2>/dev/null || echo 0)"
  while :; do
    n=$((n + 1))
    [ "$n" -gt 99 ] && { echo "site-sync-card: seq exhausted (98NN)" >&2; exit 0; }
    f="$QUEUE/98$(printf '%02d' "$n")-docs-drift-$surface_slug.md"
    ls "$QUEUE"/98"$(printf '%02d' "$n")"-* "$TL"/done/98"$(printf '%02d' "$n")"-* >/dev/null 2>&1 || break
  done
  printf '%s\n' "$n" > "$SEQ"

  # all drift lines of this surface; the surface path is read back from the first STALE line text
  lines="$(awk -F'\t' -v s="$surface_slug" '{ split($1, a, ":"); if (a[1] == "DOCS" && a[2] == "drift" && a[4] == s) print $2 }' "$CUR")"
  surface_file="$(printf '%s\n' "$lines" | sed -n 's/^\([^ :]*\): expected .*/\1/p' | head -1)"
  [ -n "$surface_file" ] || surface_file="$surface_slug"
  review=sonnet
  case "$surface_file" in
    docs/payments.md|static/terms.html) review=fable ;;
  esac
  tmp="$f.tmp.$$"
  {
    echo "REVIEW: $review"
    echo "MODEL: sonnet"
    echo "MAX_ATTEMPTS: 2"
    echo "DOCS: $surface_file"
    echo
    echo "# docs drift - $surface_file (filed by site-sync-card.sh, T-0542)"
    echo
    echo "ENGLISH-ONLY. Tree: ~/apibase-fleet (ci-staging). Rebase on origin/main first."
    [ "$review" = fable ] && echo "This surface is on a money path (payments or terms), so REVIEW is fable, not sonnet."
    echo
    echo "## Drift found (site-facts.py check-live)"
    printf '%s\n' "$lines" | sed 's/^/- /'
    echo
    echo "## Rule"
    echo "Read the LIVE page and the GitHub file first, edit the existing sentence in place, one canonical place per fact,"
    echo "re-run \`python3 -I scripts/site-facts.py check\` to zero for this surface. The facts come from"
    echo "static/.well-known/site-facts.json (scripts/gen-site-facts.ts); do not edit the facts to make a page pass."
    echo
    echo "DONE = every claims row for this surface passes and english-only is green."
  } > "$tmp" && mv "$tmp" "$f"
  MADE=$((MADE + 1))
  printf '%s\n' "$MADE" > "$DAY"

  # marker for every drift key of this surface (the card covers all of them)
  while IFS=$'\t' read -r k2 _; do
    case "$k2" in DOCS:drift:*) ;; *) continue ;; esac
    r2="${k2#DOCS:drift:}"
    [ "${r2#*:}" = "$surface_slug" ] || continue
    printf 'key=%s\ncard=%s\nfiled=%s\n' "$k2" "$(basename "$f")" "$(date -u +%FT%TZ)" > "$CARDS/$(slug "$k2")"
  done < "$CUR"
done < "$CUR"
exit 0
