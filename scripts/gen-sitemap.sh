#!/usr/bin/env bash
# gen-sitemap.sh — regenerate static/sitemap.xml from the actual served static surface.
#
# Root cause of the 2026-04-22 freeze (found 2026-09-02): sitemap.xml was hand-authored
# ONCE, in commit 5e41aca ("feat(discovery): sitemap, Link headers, ..."), and no
# generator or cron ever existed for it -- not "the cron died", there simply never was
# one. `git log -- static/sitemap.xml` shows exactly one commit touching the file, ever,
# before this fix. Four real pages shipped after that date with zero sitemap entry:
# /pricing, /catalog, /connect, /policy/moderation -- confirmed live via curl (all 200).
#
# This script is now the ONLY writer of static/sitemap.xml (never hand-edit it). It is
# wired into scripts/sync-counts.sh's daily 05:00 UTC self-heal cron, so a newly shipped
# page enters the sitemap the same day sync-counts.sh next runs, not months later.
#
# Source of truth: the filesystem itself, not a second hand-kept list of pages --
# static/*.html (mapped through nginx's own basename routes) + everything under
# static/.well-known/** (mapped 1:1, whatever shape it is) + the handful of root-level
# text files and the one backend-rendered page with no static/*.html twin (/onboard).
# A new page only needs to exist on disk to show up here -- nothing to remember to edit.
#
# --print: write the XML to stdout instead of static/sitemap.xml (read-only use, e.g.
# sync-counts.sh's --check-mode STALE_SITEMAP diff).
set -euo pipefail
ROOT="${ROOT:-/home/apibase/apibase}"; cd "$ROOT"

OUT="static/sitemap.xml"
[ "${1:-}" = "--print" ] && OUT="/dev/stdout"

lastmod() {
  local f="$1"
  local d
  d=$(git log -1 --format=%cd --date=format:%Y-%m-%d -- "$f" 2>/dev/null || true)
  [ -n "$d" ] && echo "$d" || date +%Y-%m-%d
}

# priority/changefreq: known values carried over from the original hand-authored file
# for URLs that existed there; sensible defaults assigned for pages that didn't.
priority_for() {
  case "$1" in
    /) echo 1.0 ;;
    /dashboard) echo 0.9 ;;
    /connect) echo 0.9 ;;
    /catalog) echo 0.9 ;;
    /onboard) echo 0.8 ;;
    /frameworks) echo 0.8 ;;
    /pricing) echo 0.8 ;;
    /contact) echo 0.5 ;;
    /policy/moderation) echo 0.5 ;;
    /privacy) echo 0.4 ;;
    /terms) echo 0.4 ;;
    /ai.txt|/llms.txt) echo 0.9 ;;
    /robots.txt) echo 0.3 ;;
    /.well-known/mcp.json|/.well-known/mcp/server-card.json|/.well-known/api-catalog|/.well-known/openapi.json) echo 1.0 ;;
    /.well-known/agent.json|/.well-known/ai-capabilities.json|/.well-known/oauth-authorization-server|/.well-known/oauth-protected-resource) echo 0.9 ;;
    /.well-known/x402-payment.json|/.well-known/agent-skills/index.json|/.well-known/ucp|/.well-known/acp.json) echo 0.8 ;;
    /.well-known/kya-policy.json) echo 0.6 ;;
    /.well-known/openid-configuration) echo 0.7 ;;
    *) echo 0.5 ;;
  esac
}
freq_for() {
  case "$1" in
    /|/dashboard) echo hourly ;;
    /connect|/frameworks|/pricing) echo weekly ;;
    /catalog) echo daily ;;
    /onboard|/contact|/policy/moderation|/privacy|/terms) echo monthly ;;
    /ai.txt|/llms.txt) echo daily ;;
    /robots.txt) echo monthly ;;
    /.well-known/*)
      case "$1" in
        /.well-known/x402-payment.json|/.well-known/kya-policy.json|/.well-known/agent-skills/index.json|/.well-known/oauth-authorization-server|/.well-known/oauth-protected-resource|/.well-known/openid-configuration|/.well-known/ucp|/.well-known/acp.json) echo monthly ;;
        *) echo daily ;;
      esac
      ;;
    *) echo monthly ;;
  esac
}

emit() {
  local url="$1" file="$2"
  printf '  <url>\n    <loc>https://apibase.pro%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>%s</changefreq>\n    <priority>%s</priority>\n  </url>\n' \
    "$url" "$(lastmod "$file")" "$(freq_for "$url")" "$(priority_for "$url")"
}

{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'

  for f in static/*.html; do
    base=$(basename "$f" .html)
    case "$base" in
      index) url="/" ;;
      policy-moderation) url="/policy/moderation" ;;
      *) url="/$base" ;;
    esac
    emit "$url" "$f"
  done

  # backend-rendered page, no static/*.html twin -- nginx proxies it straight to the app
  emit "/onboard" "src/routes/onboard.router.ts"

  for f in static/ai.txt static/llms.txt static/robots.txt; do
    [ -f "$f" ] && emit "/$(basename "$f")" "$f"
  done

  while IFS= read -r f; do
    rel="${f#static/.well-known/}"
    emit "/.well-known/$rel" "$f"
  done < <(find static/.well-known -type f | sort)

  echo '</urlset>'
} > "$OUT"

[ "$OUT" = "static/sitemap.xml" ] && echo "gen-sitemap: wrote $(grep -c '<loc>' static/sitemap.xml) URLs to static/sitemap.xml"
exit 0
