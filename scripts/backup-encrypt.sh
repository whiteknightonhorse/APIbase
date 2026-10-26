#!/bin/bash
# T-0355: encrypt the daily pg dumps into a staging dir that the operator's laptop pulls over ssh.
# T-0571: three dump families plus an env snapshot, all in the same age pipeline:
#   apibase     written by the postgres_backup container (docker-compose.prod.yml)
#   fleet, orchestra  pg_dump via docker exec, written here as <family>-YYYYMMDD.sql.gz (config "extra_dumps")
#   env         env-YYYYMMDD.tar.age: tar of .env + the secrets dir + offsite.json piped straight into age
#               (config "env_snapshot"; no plaintext copy is ever written)
# Usage: backup-encrypt.sh [--dumps-dir <dir>] [--staging <dir>]
# Last stdout line: "ENCRYPT OK new=<n> staged=<m> seconds=<s>" or "ENCRYPT FAIL <reason>" (exit 1).
set -euo pipefail
umask 027

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

DOCKER="${DOCKER_BIN:-docker}"
STAMP="$(date -u +%Y%m%d)"
KEEP="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("keep_server_copies",7))' "$CONFIG")" \
  || fail "cannot parse keep_server_copies"

# Dump the fleet and orchestra databases next to the prod dumps (same naming, same rotation).
DUMP_SPECS="$(python3 -c 'import json,sys
for d in json.load(open(sys.argv[1])).get("extra_dumps", []):
    print("\t".join(d[k] for k in ("family", "container", "user", "db")))' "$CONFIG")" \
  || fail "cannot parse extra_dumps"
FAMILIES="apibase"
while IFS=$'\t' read -r fam container duser ddb; do
  [ -n "$fam" ] || continue
  FAMILIES="$FAMILIES $fam"
  out="$DUMPS/$fam-$STAMP.sql.gz"
  [ -e "$out" ] && continue
  rm -f "$out.tmp"
  if ! { "$DOCKER" exec "$container" pg_dump -U "$duser" -d "$ddb" | gzip > "$out.tmp"; } 2>"$STAGING/.dump.err" \
     || ! gzip -t "$out.tmp"; then
    rm -f "$out.tmp"
    fail "pg_dump failed for $fam: $(tr '\n' ' ' < "$STAGING/.dump.err")"
  fi
  mv -f "$out.tmp" "$out"
done <<< "$DUMP_SPECS"
rm -f "$STAGING/.dump.err"

shopt -s nullglob
# sha256 is recorded at first sight, before encryption; backup-verify.sh compares against it on schedule.
for f in "$DUMPS"/*-[0-9]*.sql.gz; do
  [ -e "$f.sha256" ] || (cd "$DUMPS" && sha256sum "$(basename "$f")" > "$(basename "$f").sha256")
done

NEW=0
for fam in $FAMILIES; do
  for f in "$DUMPS"/$fam-[0-9]*.sql.gz; do
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
done

# env snapshot: tar stdout straight into age. Skipped when config has no env_snapshot.deploy_dir.
DEPLOY="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("env_snapshot", {}).get("deploy_dir", ""))' "$CONFIG")" \
  || fail "cannot parse env_snapshot"
if [ -n "$DEPLOY" ]; then
  envname="env-$STAMP.tar.age"
  if [ ! -e "$STAGING/$envname" ]; then
    [ -r "$DEPLOY/.env" ] || fail "env snapshot: $DEPLOY/.env not readable"
    members=(.env)
    [ -e "$DEPLOY/secrets" ] && members+=(secrets)
    rm -f "$STAGING/$envname.tmp"
    if ! { tar -C "$DEPLOY" -cf - "${members[@]}" -C "$ROOT" config/backup/offsite.json \
           | age -r "$RECIPIENT" -o "$STAGING/$envname.tmp"; } 2>"$STAGING/.age.err"; then
      rm -f "$STAGING/$envname.tmp"
      fail "env snapshot failed: $(tr '\n' ' ' < "$STAGING/.age.err")"
    fi
    mv -f "$STAGING/$envname.tmp" "$STAGING/$envname"
    (cd "$STAGING" && sha256sum "$envname" > "$envname.sha256") || fail "sha256sum failed for $envname"
    NEW=$((NEW + 1))
  fi
  # Rotation mirrors daily: keep the newest $KEEP snapshots.
  i=0
  for e in $(printf '%s\n' "$STAGING"/env-[0-9]*.tar.age | sort -r); do
    i=$((i + 1))
    [ "$i" -le "$KEEP" ] || rm -f "$e" "$e.sha256"
  done
fi
rm -f "$STAGING/.age.err"

# Mirror the server-side rotation: drop staged files whose source dump is gone.
for a in "$STAGING"/*-[0-9]*.sql.gz.age; do
  base="$(basename "$a" .age)"
  if [ ! -e "$DUMPS/$base" ]; then
    rm -f "$a" "$a.sha256"
  fi
done
for s in "$STAGING"/*-[0-9]*.sql.gz.age.sha256; do
  base="$(basename "$s" .age.sha256)"
  [ -e "$DUMPS/$base" ] || rm -f "$s"
done

for s in "$DUMPS"/*-[0-9]*.sql.gz.sha256; do
  [ -e "${s%.sha256}" ] || rm -f "$s"
done

chmod 640 "$STAGING"/*-[0-9]*.age"$STAGING"/*-[0-9]*.age.sha256 2>/dev/null || true
# Dump dir hygiene (A4-02): only the owner writes, group reads.
chmod 750 "$DUMPS" 2>/dev/null || true
chmod 640 "$DUMPS"/*-[0-9]*.sql.gz "$DUMPS"/*-[0-9]*.sql.gz.sha256 2>/dev/null || true

STAGED=0
for a in "$STAGING"/*-[0-9]*.age; do STAGED=$((STAGED + 1)); done
echo "ENCRYPT OK new=$NEW staged=$STAGED seconds=$((SECONDS - START))"
