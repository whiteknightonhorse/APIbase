#!/bin/bash
# T-0355: proof runs (a)-(e) for backup-encrypt.sh and backup-offsite-check.sh, using a throw-away key.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/dumps" "$T/root/config/backup" "$T/root/scripts"
# Copy scripts so ROOT resolves to the temp tree with a throw-away recipient.
cp "$ROOT"/scripts/backup-encrypt.sh "$ROOT"/scripts/backup-offsite-check.sh "$T/root/scripts/"
age-keygen -o "$T/t.key" 2>/dev/null
REC="$(age-keygen -y "$T/t.key")"
printf '{"age_recipient":"%s","staging_dir":"backups/offsite-staging","keep_server_copies":7}\n' "$REC" > "$T/root/config/backup/offsite.json"
for d in 20261011 20261012 20261013; do echo "dump $d" | gzip > "$T/dumps/apibase-$d.sql.gz"; done
echo latest | gzip > "$T/dumps/apibase-latest.sql.gz"
E="$T/root/scripts/backup-encrypt.sh"; C="$T/root/scripts/backup-offsite-check.sh"; S="$T/stg"
fail() { echo "FAIL: $*"; exit 1; }
last() { tail -n1 <<<"$1"; }

o="$(bash "$E" --dumps-dir "$T/dumps" --staging "$S")"; echo "$o"
[[ "$(last "$o")" == "ENCRYPT OK new=3 staged=3 "* ]] || fail "(a) first run"
o="$(bash "$E" --dumps-dir "$T/dumps" --staging "$S")"; echo "$o"
[[ "$(last "$o")" == "ENCRYPT OK new=0 staged=3 "* ]] || fail "(a) second run"
[ ! -e "$S/apibase-latest.sql.gz.age" ] || fail "latest must not be staged"
[ "$(stat -c %a "$S")" = 750 ] || fail "staging mode"

one=apibase-20261012.sql.gz
age -d -i "$T/t.key" "$S/$one.age" | gunzip -t || fail "(b) decrypt"
(cd "$S" && sha256sum -c "$one.age.sha256") || fail "(b) sha"

rm "$T/dumps/$one"
o="$(bash "$E" --dumps-dir "$T/dumps" --staging "$S")"; echo "$o"
[[ "$(last "$o")" == "ENCRYPT OK new=0 staged=2 "* ]] || fail "(c) staged=2"
[ ! -e "$S/$one.age" ] && [ ! -e "$S/$one.age.sha256" ] || fail "(c) leftovers"

printf '{"age_recipient":"age1xxx","staging_dir":"x","keep_server_copies":7}\n' > "$T/root/config/backup/offsite.json"
set +e; o="$(bash "$E" --dumps-dir "$T/dumps" --staging "$T/stg2")"; rc=$?; set -e
echo "$o (rc=$rc)"
[ "$rc" = 1 ] && [[ "$(last "$o")" == "ENCRYPT FAIL "* ]] || fail "(d) bad recipient"

chk() { set +e; out="$(bash "$C" --staging "$S" "$@")"; rc=$?; set -e; echo "[rc=$rc] $out"; }
NOW=2026-10-13T12:00:00Z
chk --now $NOW; [ "$rc" = 1 ] && [[ "$out" == "OFFSITE-PULL STALE age=unknown last=none" ]] || fail "(e) stale"
chk --now $NOW; [ "$rc" = 1 ] && [ -z "$out" ] || fail "(e) silent stale"
echo "apibase-20261013.sql.gz.age 2026-10-13T11:00:00Z" > "$S/.last-pull"
chk --now $NOW; [ "$rc" = 0 ] && [[ "$out" == "OFFSITE-PULL RESOLVED last=apibase-20261013.sql.gz.age" ]] || fail "(e) resolved"
chk --now $NOW --verbose; [ "$rc" = 0 ] && [[ "$out" == "OFFSITE-PULL OK last=apibase-20261013.sql.gz.age age=1h" ]] || fail "(e) ok"
chk --now 2026-10-16T11:00:00Z; [ "$rc" = 1 ] && [[ "$out" == "OFFSITE-PULL STALE age=72h last=apibase-20261013.sql.gz.age" ]] || fail "(e) 72h stale"
echo "PASS"
