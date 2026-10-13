#!/bin/bash
# T-0355: encrypt the daily pg dumps into a staging dir that the operator's laptop pulls over ssh.
# Usage: backup-encrypt.sh [--dumps-dir <dir>] [--staging <dir>]
# Last stdout line: "ENCRYPT OK new=<n> staged=<m> seconds=<s>" or "ENCRYPT FAIL <reason>" (exit 1).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/config/backup/offsite.json"
DUMPS="$ROOT/backups/daily"
STAGING=""
START=$SECONDS

fail() { echo "ENCRYPT FAIL $*"; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dumps-dir) [ $# -ge 2 ] || fail "missing value for --dumps-dir"; DUMPS="$2"; shift 2 ;;
    --staging) [ $# -ge 2 ] || fail "missing value for --staging"; STAGING="$2"; shift 2 ;;
    *) fail "unknown argument $1" ;;
  esac
done

command -v age >/dev/null 2>&1 || fail "age not installed"
[ -r "$CONFIG" ] || fail "config not readable: $CONFIG"
RECIPIENT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["age_recipient"])' "$CONFIG")" \
  || fail "cannot parse age_recipient from config"
if [ -z "$STAGING" ]; then
  REL="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["staging_dir"])' "$CONFIG")" \
    || fail "cannot parse staging_dir from config"
  case "$REL" in /*) STAGING="$REL" ;; *) STAGING="$ROOT/$REL" ;; esac
fi
case "$RECIPIENT" in
  age1*) ;;
  *) fail "recipient is not an age public key" ;;
esac
[ -d "$DUMPS" ] || fail "dumps dir missing: $DUMPS"

mkdir -p -m 750 "$STAGING" || fail "cannot create staging dir"

NEW=0
shopt -s nullglob
for f in "$DUMPS"/apibase-[0-9]*.sql.gz; do
  name="$(basename "$f")"
  [ -e "$STAGING/$name.age" ] && continue
  rm -f "$STAGING/$name.age.tmp"
  if ! age -r "$RECIPIENT" -o "$STAGING/$name.age.tmp" "$f" 2>"$STAGING/.age.err"; then
    rm -f "$STAGING/$name.age.tmp"
    fail "age failed for $name: $(tr '\n' ' ' < "$STAGING/.age.err")"
  fi
  mv -f "$STAGING/$name.age.tmp" "$STAGING/$name.age"
  (cd "$STAGING" && sha256sum "$name.age" > "$name.age.sha256") || fail "sha256sum failed for $name"
  NEW=$((NEW + 1))
done
rm -f "$STAGING/.age.err"

# Mirror the server-side rotation: drop staged files whose source dump is gone.
for a in "$STAGING"/apibase-[0-9]*.sql.gz.age; do
  base="$(basename "$a" .age)"
  if [ ! -e "$DUMPS/$base" ]; then
    rm -f "$a" "$a.sha256"
  fi
done
for s in "$STAGING"/apibase-[0-9]*.sql.gz.age.sha256; do
  base="$(basename "$s" .age.sha256)"
  [ -e "$DUMPS/$base" ] || rm -f "$s"
done

chmod 640 "$STAGING"/apibase-[0-9]*.sql.gz.age "$STAGING"/apibase-[0-9]*.sql.gz.age.sha256 2>/dev/null || true

STAGED=0
for a in "$STAGING"/apibase-[0-9]*.sql.gz.age; do STAGED=$((STAGED + 1)); done
echo "ENCRYPT OK new=$NEW staged=$STAGED seconds=$((SECONDS - START))"
