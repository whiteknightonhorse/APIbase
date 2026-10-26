#!/bin/sh
# Refresh the UC-22 IP country database: DB-IP Country Lite (CC BY 4.0, attribution on /legal).
# Downloads dbip-country-lite-YYYY-MM.mmdb.gz (current month, previous month as fallback while the
# new one is not published yet), verifies gzip and the MMDB marker, then moves it into place
# atomically. Exit non-zero on any failure; the previous database stays untouched.
# Usage: scripts/geo-db-refresh.sh   (GEO_MMDB_PATH overrides the target file)
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${GEO_MMDB_PATH:-$ROOT/data/geo/dbip-country-lite.mmdb}"
BASE="https://download.db-ip.com/free"
MIN_BYTES=1000000

DIR="$(dirname "$TARGET")"
mkdir -p "$DIR"
TMP="$(mktemp -d "$DIR/.geo-refresh.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT INT TERM

fetch() { # url dest
  if command -v wget >/dev/null 2>&1; then
    wget -q -T 60 -O "$2" "$1"
  else
    curl -fsS --max-time 120 -o "$2" "$1"
  fi
}

THIS_MONTH="$(date -u +%Y-%m)"
PREV_MONTH="$(date -u -d "$(date -u +%Y-%m-01) -1 day" +%Y-%m 2>/dev/null || true)"

GOT=""
for ym in "$THIS_MONTH" $PREV_MONTH; do
  if fetch "$BASE/dbip-country-lite-$ym.mmdb.gz" "$TMP/db.gz"; then
    GOT="$ym"
    break
  fi
done
[ -n "$GOT" ] || { echo "geo-db-refresh: download failed for $THIS_MONTH ${PREV_MONTH:-}" >&2; exit 1; }

gzip -t "$TMP/db.gz" || { echo "geo-db-refresh: corrupt gzip" >&2; exit 1; }
gzip -dc "$TMP/db.gz" >"$TMP/db.mmdb"
SIZE="$(wc -c <"$TMP/db.mmdb")"
[ "$SIZE" -ge "$MIN_BYTES" ] || { echo "geo-db-refresh: database too small ($SIZE bytes)" >&2; exit 1; }
grep -qa "MaxMind.com" "$TMP/db.mmdb" || { echo "geo-db-refresh: not an MMDB file" >&2; exit 1; }

chmod 0644 "$TMP/db.mmdb"
mv -f "$TMP/db.mmdb" "$TARGET"
echo "geo-db-refresh: installed dbip-country-lite-$GOT ($SIZE bytes) at $TARGET"
