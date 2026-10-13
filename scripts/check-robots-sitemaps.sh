#!/bin/bash
# T-0342: every `Sitemap:` URL in static/robots.txt must answer 200.
# SITEMAP_FETCH_CMD (test stub / override) is run as `$SITEMAP_FETCH_CMD <url>` and must print
# the HTTP status. Default: local nginx (SITEMAP_FETCH_BASE, 127.0.0.1:8880, Host apibase.pro).
# Prints one line per failing URL and exits 1 on any non-200; needs no database.
set -uo pipefail
ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
bad=""
while IFS= read -r u; do
  [ -n "$u" ] || continue
  if [ -n "${SITEMAP_FETCH_CMD:-}" ]; then code=$($SITEMAP_FETCH_CMD "$u" 2>/dev/null || true)
  else code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' -H 'Host: apibase.pro' \
    "${SITEMAP_FETCH_BASE:-http://127.0.0.1:8880}${u#https://apibase.pro}" 2>/dev/null || true); fi
  [ "$code" = "200" ] || bad="${bad}  ${u} -> ${code:-no response}"$'\n'
done < <(sed -n 's/^Sitemap:[[:space:]]*\([^[:space:]]*\).*/\1/p' "$ROOT/static/robots.txt")
[ -z "$bad" ] || { echo "ROBOTS_SITEMAP_404 — robots.txt Sitemap URL(s) not 200:"; printf '%s' "$bad"; exit 1; }
