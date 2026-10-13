#!/bin/bash
# T-0344: every indexable HTML page carries title, description, canonical, og:*, twitter:card and the
# shared <footer>. Crawls static/**/*.html (not body fragments or video slide templates) and fetches
# the rendered pages from the local nginx (PAGE_META_BASE, Host apibase.pro). /integrator* pages also
# need a BreadcrumbList. Prints one line per failure and a summary; exit 1 on any failure.
#   --no-fetch   crawl static/ only (CI has no server)
# Needs no database of its own, but /m/apibase-demo is served from one, so a 5xx there is a failure.
set -uo pipefail
ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
NO_FETCH=0
for a in "$@"; do [ "$a" = "--no-fetch" ] && NO_FETCH=1; done
export ROOT NO_FETCH
export PAGE_META_BASE="${PAGE_META_BASE:-http://127.0.0.1:8880}"
export PAGE_META_PATHS="${PAGE_META_PATHS:-/m/apibase-demo /legal/aup /guides/ /integrator /integrator/buyers}"
exec python3 -I - <<'PY'
import glob, html, os, re, subprocess, sys

root, base = os.environ["ROOT"], os.environ["PAGE_META_BASE"]
fragment = open(os.path.join(root, "config/page-footer.html"), encoding="utf-8").read().strip()
fails, titles, checked = [], {}, 0

def meta(s, attr, name):
    for m in re.finditer(r"<meta\b[^>]*>", s):
        tag = m.group(0)
        if re.search(r'\b%s="%s"' % (attr, re.escape(name)), tag):
            c = re.search(r'\bcontent="([^"]*)"', tag)
            return html.unescape(c.group(1)) if c else ""
    return None

def check(label, s, path):
    global checked
    checked += 1
    bad = lambda why: fails.append("%s: %s" % (label, why))
    if "<footer" not in s: bad("no <footer>")
    elif fragment not in s: bad("footer differs from config/page-footer.html")
    if "noindex" in (meta(s, "name", "robots") or "").lower(): return
    t = re.search(r"<title>(.*?)</title>", s, re.S)
    t = html.unescape(t.group(1)).strip() if t else ""
    if not 20 <= len(t) <= 65: bad("title length %d not in 20-65: %r" % (len(t), t))
    elif t in titles: bad("title %r duplicates %s" % (t, titles[t]))
    else: titles[t] = label
    d = meta(s, "name", "description")
    if d is None: bad("no meta description")
    elif not 70 <= len(d) <= 160: bad("description length %d not in 70-160" % len(d))
    c = re.search(r'<link rel="canonical" href="([^"]*)"', s)
    if not c: bad("no canonical")
    elif not c.group(1).startswith("https://apibase.pro/"): bad("canonical not absolute https://apibase.pro/: %s" % c.group(1))
    for p in ("og:title", "og:description", "og:image"):
        if not meta(s, "property", p): bad("no " + p)
    if meta(s, "name", "twitter:card") != "summary_large_image": bad("twitter:card is not summary_large_image")
    if path and path.startswith("/integrator") and "BreadcrumbList" not in s: bad("no BreadcrumbList JSON-LD")

def skip(f):
    return os.path.basename(f).startswith("_") or "/video/templates/" in f or \
        os.path.dirname(f).endswith("static/integrator")

for f in sorted(glob.glob(os.path.join(root, "static/**/*.html"), recursive=True)):
    if skip(f): continue
    check(os.path.relpath(f, root), open(f, encoding="utf-8").read(), None)

if os.environ["NO_FETCH"] != "1":
    for p in os.environ["PAGE_META_PATHS"].split():
        r = subprocess.run(["curl", "-s", "-m", "15", "-H", "Host: apibase.pro", "-w", "\n%{http_code}", base + p],
                           capture_output=True, text=True)
        body, _, code = r.stdout.rpartition("\n")
        if code != "200":
            fails.append("%s: HTTP %s" % (p, code or "no response"))
            checked += 1
        else:
            check(p, body, p)

for f in fails: print("PAGE_META_FAIL " + f)
print("check-page-meta: pages checked = %d, failures = %d" % (checked, len(fails)))
sys.exit(1 if fails else 0)
PY
