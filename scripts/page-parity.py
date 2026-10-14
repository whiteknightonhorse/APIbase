#!/usr/bin/env python3
"""T-0383: content-parity gate for the design-M site migration.

Compares the rendered page with the snapshot of 2026-10-13 in tests/fixtures/page-baseline/:
  <name>.txt        visible text of the old page (whitespace-joined tokens, <title> included)
  <name>.meta.json  {"links": [every href], "ids": [every id], "scripts": <number of <script> tags>}
  dashboard-api.json  shape of GET /api/v1/dashboard (fetch mode only)
A page passes when
  * every baseline word token is present in the rendered page in the SAME ORDER (extra tokens are fine),
  * every baseline href and every baseline id is present,
  * the rendered page has at least as many <script> tags as the baseline.
Only decoration may be removed, and only through the allow-list tests/fixtures/page-baseline/<name>.allow.txt
(and _all.allow.txt for every page). One entry per line, '#' starts a comment:
  <word tokens>   a token sequence taken out of the baseline text (every occurrence)
  href: <value>   a baseline href that may disappear
  id: <value>     a baseline element id that may disappear
Output: PARITY_FAIL <page>: missing text|href|id|scripts <value>, then a summary line. Exit 1 on any failure.

Usage: python3 -I scripts/page-parity.py [page ...] [--render [--rendered-dir DIR]] [--base URL] [--list]
  page            baseline name (home, about, integrator_buyers, ...); default is every baseline page
  (default)       fetch from $PARITY_BASE (default http://127.0.0.1:8880) with Accept: text/html
  --render        offline: static pages are read from static/; pages the app renders (integrator, legal, onboard)
                  are read from DIR/<name>.html when --rendered-dir is given (tests/unit/page-parity.test.ts
                  writes them with the app's own render functions), and are skipped otherwise;
                  pages that need the database (shops, m_apibase-demo) and dashboard-api are fetch-only.
Mutation check: delete one sentence from static/index.html and `page-parity.py home --render` must FAIL."""
import difflib, html, json, os, re, subprocess, sys, time

ROOT = os.environ.get("ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, "tests/fixtures/page-baseline")
DB_PAGES = {"shops", "m_apibase-demo"}


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def baseline_names():
    return sorted(f[:-4] for f in os.listdir(FIX) if f.endswith(".txt") and not f.endswith(".allow.txt"))


def page_path(name):
    return "/" if name == "home" else "/" + name.replace("_", "/")


def static_file(name):
    p = page_path(name).strip("/")
    for cand in ("index" if not p else p.replace("/", "-"),):
        f = os.path.join(ROOT, "static", cand + ".html")
        if os.path.isfile(f):
            return f
    return None


def strip_noise(s):
    s = re.sub(r"<!--.*?-->", " ", s, flags=re.S)
    return re.sub(r"<(script|style|noscript|template)\b.*?</\1\s*>", " ", s, flags=re.S | re.I)


def visible_tokens(s):
    s = strip_noise(s)
    s = re.sub(r"<head\b[^>]*>(.*?)</head>", lambda m: " " + ((re.search(r"<title[^>]*>(.*?)</title>", m.group(1), re.S | re.I) or [0, ""])[1]) + " ", s, flags=re.S | re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    return html.unescape(s).split()


def attr_values(s, attr):
    s = re.sub(r"<!--.*?-->", " ", s, flags=re.S)
    pat = r"""(?<![\w-])%s\s*=\s*(?:"([^"]*)"|'([^']*)')""" % attr
    return {a if a else b for a, b in re.findall(pat, s)}


def hrefs(s):
    return attr_values(s, "href")


def ids(s):
    return attr_values(s, "id")


def allow(name):
    seqs, hs, ds = [], set(), set()
    for f in ("_all.allow.txt", name + ".allow.txt"):
        p = os.path.join(FIX, f)
        if not os.path.isfile(p):
            continue
        for line in read(p).splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("href:"):
                hs.add(line[5:].strip())
            elif line.startswith("id:"):
                ds.add(line[3:].strip())
            else:
                seqs.append(line.split())
    return sorted(seqs, key=len, reverse=True), hs, ds


ISO_TS = re.compile(r"\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?")
COUNT = re.compile(r"\d[\d,]{2,}$")
COUNT_UNIT = re.compile(r"(tools|providers)\b", re.I)


def norm_ts(tokens):
    """T-0391/T-0400: volatile values compare as placeholders on both sides: ISO dates and datetimes
    (catalog sync date, refresh time) and the generated site totals ("<N> tools", "<N> providers", N >= 100; small per-provider counts stay content).
    Only the value is neutral; the words around it must still be present."""
    out = []
    for i, t in enumerate(tokens):
        if COUNT.match(t) and i + 1 < len(tokens) and COUNT_UNIT.match(tokens[i + 1]):
            t = "<COUNT>"
        out.append(ISO_TS.sub("<ISO-DATE>", t))
    return out


def remove_seqs(tokens, seqs):
    out, i, n = [], 0, len(tokens)
    while i < n:
        for q in seqs:
            if tokens[i:i + len(q)] == q:
                i += len(q)
                break
        else:
            out.append(tokens[i])
            i += 1
    return out


def missing_runs(base, got):
    """Runs of baseline tokens with no counterpart when both token streams are aligned in order."""
    runs, cur, i = [], [], 0
    for blk in difflib.SequenceMatcher(None, base, got, autojunk=False).get_matching_blocks():
        if blk.a > i:
            runs.append(base[i:blk.a])
        i = blk.a + blk.size
    return runs


def compare(name, body):
    fails = []
    seqs, ah, ad = allow(name)
    base = norm_ts(remove_seqs(read(os.path.join(FIX, name + ".txt")).split(), seqs))
    for run in missing_runs(base, norm_ts(visible_tokens(body))):
        fails.append("missing text " + " ".join(run[:14]) + (" ..." if len(run) > 14 else ""))
    meta = json.load(open(os.path.join(FIX, name + ".meta.json"), encoding="utf-8"))
    have_h, have_i = hrefs(body), ids(body)
    for h in meta["links"]:
        if h not in have_h and h not in ah:
            fails.append("missing href " + h)
    for d in meta["ids"]:
        if d not in have_i and d not in ad:
            fails.append("missing id " + d)
    n = len(re.findall(r"<script\b", body, flags=re.I))
    if n < meta["scripts"]:
        fails.append("missing scripts %d < %d" % (n, meta["scripts"]))
    return ["PARITY_FAIL %s: %s" % (name, f) for f in fails]


def fetch(base_url, path):
    code, body = "", ""
    for _ in range(int(os.environ.get("PARITY_RETRIES", "6"))):
        r = subprocess.run(["curl", "-s", "-m", "20", "-H", "Host: apibase.pro", "-H", "Accept: text/html", "-A", "apibase-page-parity/1 (+https://apibase.pro)", "-w", "\n%{http_code}", base_url + path],
                           capture_output=True, text=True)
        body, _, code = r.stdout.rpartition("\n")
        if code.isdigit() and int(code) < 500 and code != "000":
            break
        time.sleep(int(os.environ.get("PARITY_RETRY_SLEEP", "5")))
    return code, body


def dashboard_api(base_url):
    base = json.load(open(os.path.join(FIX, "dashboard-api.json"), encoding="utf-8"))
    r = subprocess.run(["curl", "-s", "-m", "30", "-H", "Host: apibase.pro", base_url + "/api/v1/dashboard"], capture_output=True, text=True)
    try:
        live = json.loads(r.stdout)
    except ValueError:
        return ["PARITY_FAIL dashboard-api: /api/v1/dashboard is not JSON"]
    out = ["PARITY_FAIL dashboard-api: missing key " + k for k in base if k not in live]
    if base.get("providers") and live.get("providers"):
        out += ["PARITY_FAIL dashboard-api: missing provider key " + k for k in base["providers"][0] if k not in live["providers"][0]]
    return out


def main(argv):
    render = "--render" in argv
    rdir = argv[argv.index("--rendered-dir") + 1] if "--rendered-dir" in argv else None
    base_url = argv[argv.index("--base") + 1] if "--base" in argv else os.environ.get("PARITY_BASE", "http://127.0.0.1:8880")
    skip_next = {argv[i + 1] for i, a in enumerate(argv[:-1]) if a in ("--rendered-dir", "--base")}
    pages = [a for a in argv if not a.startswith("--") and a not in skip_next]
    names = baseline_names()
    if "--list" in argv:
        print("\n".join(names))
        return 0
    todo = pages or names + ([] if render else ["dashboard-api"])
    out, checked, skipped = [], 0, []
    for name in todo:
        if name == "dashboard-api":
            if render:
                skipped.append(name)
                continue
            checked += 1
            out += dashboard_api(base_url)
            continue
        if name not in names:
            out.append("PARITY_FAIL %s: no baseline" % name)
            continue
        if render:
            f = static_file(name)
            if f:
                body = read(f)
            elif rdir and os.path.isfile(os.path.join(rdir, name + ".html")):
                body = read(os.path.join(rdir, name + ".html"))
            else:
                skipped.append(name)
                continue
        else:
            code, body = fetch(base_url, page_path(name))
            if code != "200":
                out.append("PARITY_FAIL %s: HTTP %s" % (name, code or "no response"))
                checked += 1
                continue
        checked += 1
        out += compare(name, body)
    for line in out:
        print(line)
    for name in skipped:
        print("PARITY_SKIP %s: not renderable offline (use fetch mode or --rendered-dir)" % name)
    print("page-parity: pages checked = %d, skipped = %d, failures = %d" % (checked, len(skipped), len(out)))
    return 1 if out else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
