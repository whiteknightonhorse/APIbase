#!/usr/bin/env bash
# Usage: release-check.sh <tag> | --selftest
# Exit 1 unless the tag is vX.Y.Z, equals package.json version, and docs/releases/<tag>.md is non-empty.
set -u

check() { # <tag> <root>
  local tag="$1" root="$2" rc=0 ver
  if ! [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "FAIL: tag '$tag' does not match ^v[0-9]+\.[0-9]+\.[0-9]+\$"; rc=1
  fi
  ver=$(jq -r .version "$root/package.json" 2>/dev/null)
  if [ "$ver" != "${tag#v}" ]; then
    echo "FAIL: package.json version '$ver' != tag '${tag#v}'"; rc=1
  fi
  if [ ! -s "$root/docs/releases/$tag.md" ]; then
    echo "FAIL: docs/releases/$tag.md is missing or empty"; rc=1
  fi
  return $rc
}

selftest() {
  local fail=0 out
  d=$(mktemp -d) || exit 1
  trap 'rm -rf "$d"' EXIT
  mkdir -p "$d/docs/releases"
  echo '{"version":"1.2.3"}' > "$d/package.json"
  echo "notes" > "$d/docs/releases/v1.2.3.md"
  check v1.2.3 "$d" >/dev/null || { echo "selftest: pass case failed"; fail=1; }
  out=$(check v1.2.4 "$d") && { echo "selftest: mismatch case passed"; fail=1; }
  echo "$out" | grep -q 'package.json version' || { echo "selftest: mismatch not reported"; fail=1; }
  : > "$d/docs/releases/v1.2.3.md"
  out=$(check v1.2.3 "$d") && { echo "selftest: empty notes case passed"; fail=1; }
  echo "$out" | grep -q 'missing or empty' || { echo "selftest: missing notes not reported"; fail=1; }
  check 1.2.3 "$d" >/dev/null && { echo "selftest: bad tag format passed"; fail=1; }
  [ "$fail" = 0 ] && echo "OK"
  return $fail
}

case "${1:-}" in
  --selftest) selftest ;;
  "") echo "usage: $0 <tag> | --selftest" >&2; exit 2 ;;
  *) check "$1" . || exit 1 ;;
esac
