#!/usr/bin/env bash
# T-0969: prune_stale_anon_volumes removes only dangling 64-hex volumes older than 24 h. Fake docker; the real one is never called.
set -u
cd "$(dirname "$0")/../.." || exit 2
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
OLD="$(printf 'a%.0s' $(seq 1 64))"
NEW="$(printf 'b%.0s' $(seq 1 64))"
mkdir -p "$TMP/bin"
cat >"$TMP/bin/docker" <<FAKE
#!/usr/bin/env bash
case "\$1 \$2" in
  "volume ls") printf '%s\n' "$OLD" "$NEW" wp-v48_wp ;;
  "volume inspect")
    case "\${@: -1}" in
      $OLD) date -u -d '3 days ago' +%Y-%m-%dT%H:%M:%SZ ;;
      $NEW) date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ ;;
      *) date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ ;;
    esac ;;
  "volume rm") shift 2; printf '%s\n' "\$@" >>"$TMP/removed" ;;
esac
exit 0
FAKE
chmod +x "$TMP/bin/docker"
touch "$TMP/removed"

FAILS=0
PATH="$TMP/bin:$PATH"
# shellcheck disable=SC1091
source scripts/disk-cleanup.sh >/dev/null
declare -F prune_stale_anon_volumes >/dev/null || { echo "FAIL function missing"; exit 1; }
prune_stale_anon_volumes >"$TMP/out"

[ "$(cat "$TMP/removed")" = "$OLD" ] && echo "ok   only the old 64-hex volume removed" || { echo "FAIL removed: $(cat "$TMP/removed")"; FAILS=1; }
grep -q 'Removed 1 stale' "$TMP/out" && echo "ok   count logged" || { echo "FAIL log: $(cat "$TMP/out")"; FAILS=1; }
exit "$FAILS"
