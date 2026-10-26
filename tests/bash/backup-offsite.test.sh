#!/bin/bash
# T-0355: proof runs (a)-(e) for backup-encrypt.sh and backup-offsite-check.sh, using a throw-away key.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/dumps" "$T/root/config/backup" "$T/root/scripts"
# Copy scripts so ROOT resolves to the temp tree with a throw-away recipient.
cp "$ROOT"/scripts/backup-encrypt.sh "$ROOT"/scripts/backup-offsite-check.sh "$ROOT"/scripts/backup-verify.sh "$T/root/scripts/"
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
# T-0571: fleet + orchestra dumps via a fake docker, env snapshot, verify, families.
mkdir -p "$T/dep/secrets" "$T/bin"; echo "K=v" > "$T/dep/.env"; echo pw > "$T/dep/secrets/pg"
printf "%s\n" "#!/bin/bash" "echo \"-- dump of \$3\"" > "$T/bin/docker"; chmod +x "$T/bin/docker"
printf '{"age_recipient":"%s","staging_dir":"x","keep_server_copies":2,"extra_dumps":[{"family":"fleet","container":"cf","user":"u","db":"d"},{"family":"orchestra","container":"co","user":"u","db":"d"}],"env_snapshot":{"deploy_dir":"%s"}}\n' "$REC" "$T/dep" > "$T/root/config/backup/offsite.json"
S3="$T/stg3"; D3="$T/d3"; mkdir -p "$D3"; echo "dump" | gzip > "$D3/apibase-20261013.sql.gz"
o="$(DOCKER_BIN="$T/bin/docker" bash "$E" --dumps-dir "$D3" --staging "$S3")"; echo "$o"
[[ "$(last "$o")" == "ENCRYPT OK new=4 staged=4 "* ]] || fail "(f) four items"
[ -e "$S3/fleet-$(date -u +%Y%m%d).sql.gz.age" ] && [ -e "$S3/env-$(date -u +%Y%m%d).tar.age" ] || fail "(f) names"
age -d -i "$T/t.key" "$S3"/env-*.tar.age | tar -tf - | grep -q '^secrets/pg$' || fail "(f) env contents"
[ "$(stat -c %a "$D3")" = 750 ] || fail "(f) dumps dir mode"
c="$(bash "$C" --staging "$S3" --families)"; echo "$c"
[ "$c" = "FAMILIES apibase=1 fleet=1 orchestra=1 env=1" ] || fail "(f) families"
v="$(bash "$T/root/scripts/backup-verify.sh" --dumps-dir "$D3" --outbox "$T/ob")"; echo "$v"
[[ "$v" == "BACKUP-VERIFY OK checked=3" ]] || fail "(g) verify ok"
echo corrupt >> "$D3/apibase-20261013.sql.gz"
set +e; v="$(bash "$T/root/scripts/backup-verify.sh" --dumps-dir "$D3" --outbox "$T/ob")"; rc=$?; set -e
echo "$v"; { [ "$rc" = 1 ] && grep -q backup_verify_failed "$T/ob"; } || fail "(g) verify fail"
# R2: failing fleet dump (fake docker exits 1) must not block apibase staging
printf '%s\n' '#!/bin/bash' 'echo boom >&2' 'exit 1' > "$T/bin/docker-bad"; chmod +x "$T/bin/docker-bad"
S4="$T/stg4"; D4="$T/d4"; mkdir -p "$D4"; echo "dump" | gzip > "$D4/apibase-20261013.sql.gz"
o="$(DOCKER_BIN="$T/bin/docker-bad" bash "$E" --dumps-dir "$D4" --staging "$S4" 2>/dev/null)"; echo "$o"
[[ "$(last "$o")" == "ENCRYPT OK new=2 staged=2 "*"warnings=2" ]] || fail "(h) secondary failure blocked primary"
[ -e "$S4/apibase-20261013.sql.gz.age" ] || fail "(h) apibase not staged"
# R3: extra families rotate to keep_server_copies (2)
D5="$T/d5"; mkdir -p "$D5"; echo "d" | gzip > "$D5/apibase-20261013.sql.gz"
for d in 20261001 20261002 20261003; do echo "f" | gzip > "$D5/fleet-$d.sql.gz"; done
DOCKER_BIN="$T/bin/docker" bash "$E" --dumps-dir "$D5" --staging "$T/stg5" >/dev/null
[ ! -e "$D5/fleet-20261001.sql.gz" ] && [ ! -e "$D5/fleet-20261002.sql.gz" ] && [ -e "$D5/fleet-20261003.sql.gz" ] || fail "(i) fleet rotation"
# R4: post-backup hook writes sha256 at dump time
D6="$T/d6"; mkdir -p "$D6/daily"; echo "d" | gzip > "$D6/daily/apibase-20261013.sql.gz"
BACKUP_DIR="$D6" sh "$ROOT/scripts/backup-hooks/10-sha256" post-backup
(cd "$D6/daily" && sha256sum -c --status apibase-20261013.sql.gz.sha256) || fail "(j) hook sha"
echo "PASS"
