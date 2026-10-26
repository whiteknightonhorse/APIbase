#!/usr/bin/env python3
"""T-0542: compare what the pages, README and docs say with static/.well-known/site-facts.json.

  site-facts.py check [--root DIR]
      Offline. Surfaces are read from the tree, facts from the generated site-facts.json.
      Rows whose surface is `gh:<path>` exist only on GitHub or another host and are live-only.
  site-facts.py check-live [--root DIR] [--base https://apibase.pro] [--provek https://provek.dev]
      Surfaces are fetched from each row's `url` (Accept: text/html, and Accept: text/markdown again
      for must-not-contain / tool-ids-healthy rows on HTML pages that have a markdown twin); facts come
      from <base>/.well-known/site-facts.json (the tree copy is used, with a notice, when the live
      file is not deployed yet). Also runs: the pages-to-monitor crawl, the no-3xx link hosts,
      eth_getCode on the attestation and witness contracts, and the agent-ready self-checks.

config/site-claims.tsv columns: surface url kind pattern expect finding
  kinds: regex-equals (first capture of pattern == expect), must-contain, must-not-contain,
         tool-ids-healthy (no unhealthy example tool id from the facts appears on the surface).
  A pattern or expect may hold {{token.path}} into the facts; `{{x|keys}}` renders the keys of an
  object. A token that renders to a list means every element must be present (must-contain).
  A must-contain / must-not-contain pattern starting with `re:` is a regular expression.
  A token whose value is null has no source: the row fails as "no source".

Output: one `STALE_SITE_FACTS <finding> <surface>: expected <expect> got <got>` line per failure,
plus DOCS:page / DOCS:link / DOCS:genlayer / DOCS:agentready lines from check-live, then
`site-facts: N failures`; exit 1 on any. Stdlib only, no model call, no writes.
"""
import hashlib
import html.parser
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "apibase-site-facts/1 (+https://apibase.pro)"
TOKEN = re.compile(r"\{\{([^}]+)\}\}")
ID_PATTERNS = [
    re.compile(r"tools/([a-z0-9_]+\.[a-z0-9_]+)/call"),
    re.compile(r"(?:`|\"name\":\s*\")([a-z0-9_]+\.[a-z0-9_]+)(?:`|\")"),
]


class NoSource(Exception):
    pass


# ----------------------------------------------------------------------------------------- facts
def fmt(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    if isinstance(v, (int, float)):
        return repr(v)
    return str(v)


def lookup(facts, path):
    cur = facts
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            raise NoSource("no source for {{%s}}" % path)
    if cur is None:
        raise NoSource("no source for {{%s}}" % path)
    return cur


def render(text, facts):
    """Returns (rendered_text, list_items or None). List tokens render as ', '-joined text."""
    items = []

    def sub(m):
        spec = m.group(1).strip()
        flt = None
        if "|" in spec:
            spec, flt = [x.strip() for x in spec.split("|", 1)]
        v = lookup(facts, spec)
        if flt == "keys" or isinstance(v, dict):
            v = sorted(v.keys()) if isinstance(v, dict) else v
        if isinstance(v, list):
            items.extend(fmt(x) for x in v)
            return ", ".join(fmt(x) for x in v)
        return fmt(v)

    out = TOKEN.sub(sub, text)
    return out, (items or None)


# ----------------------------------------------------------------------------------------- claims
def load_claims(root):
    path = os.path.join(root, "config/site-claims.tsv")
    rows = []
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().split("\n")
    head = lines[0].split("\t")
    if head != ["surface", "url", "kind", "pattern", "expect", "finding"]:
        raise SystemExit("site-facts: bad header in config/site-claims.tsv")
    for n, line in enumerate(lines[1:], 2):
        if not line.strip() or line.startswith("#"):
            continue
        cols = line.split("\t")
        if len(cols) != 6:
            raise SystemExit("site-facts: config/site-claims.tsv:%d has %d columns, need 6" % (n, len(cols)))
        rows.append(dict(zip(head, cols)))
    return rows


def example_ids(text):
    out = set()
    for p in ID_PATTERNS:
        out.update(p.findall(text))
    return out


def one_line(s, n=160):
    s = re.sub(r"\s+", " ", str(s)).strip()
    return s if len(s) <= n else s[: n - 3] + "..."


def eval_row(row, text, facts):
    """Returns None when the row holds, else (expected, got)."""
    kind, pat, exp = row["kind"], row["pattern"], row["expect"]
    try:
        if kind == "regex-equals":
            want, _ = render(exp, facts)
            pat_r, _ = render(pat, facts)
            m = re.search(pat_r, text)
            if not m:
                return (want, "no match for /%s/" % one_line(pat_r, 60))
            got = m.group(1) if m.groups() else m.group(0)
            return None if got.strip() == want else (want, got.strip())
        if kind in ("must-contain", "must-not-contain"):
            is_re = pat.startswith("re:")
            body = pat[3:] if is_re else pat
            has_token = TOKEN.search(body) is not None
            rendered, items = render(body, facts)
            needles = items if items else [rendered]
            hay = text.lower() if has_token and not is_re else text
            found = []
            for nd in needles:
                nd2 = nd.lower() if has_token and not is_re else nd
                ok = re.search(nd2, hay) if is_re else (nd2 in hay)
                found.append(bool(ok))
            if kind == "must-contain":
                if all(found):
                    return None
                miss = [n for n, f in zip(needles, found) if not f]
                return ("contains %s" % one_line(", ".join(miss), 100), "missing")
            if any(found):
                hit = [n for n, f in zip(needles, found) if f]
                return ('absent "%s"' % one_line(hit[0], 80), "present")
            return None
        if kind == "tool-ids-healthy":
            bad = []
            for i in sorted(example_ids(text)):
                st = facts.get("example_tools", {}).get(i)
                if st is not None and st != "healthy":
                    bad.append("%s=%s" % (i, st))
            return None if not bad else ("every example tool id healthy", ", ".join(bad))
        return ("known kind", "unknown kind %s" % kind)
    except NoSource as e:
        return ("a source for the fact", str(e))
    except re.error as e:
        return ("valid pattern", "bad regex: %s" % e)


def stale(row, surface, res):
    exp, got = res
    return "STALE_SITE_FACTS %s %s: expected %s got %s" % (
        row["finding"], surface, one_line(exp), one_line(got))


def check_offline(root, facts, rows):
    fails = []
    live_only = 0
    for row in rows:
        s = row["surface"]
        if s.startswith("gh:"):
            live_only += 1
            continue
        p = os.path.join(root, s)
        if not os.path.isfile(p):
            fails.append(stale(row, s, ("surface file in the tree", "missing")))
            continue
        with open(p, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        res = eval_row(row, text, facts)
        if res:
            fails.append(stale(row, s, res))
    return fails, live_only


# ----------------------------------------------------------------------------------------- http
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def http(url, accept="text/html", method="GET", data=None, headers=None, follow=True, timeout=10):
    """Returns (status, headers_dict_lower, body_text, seconds). Status 0 on network failure."""
    hdr = {"User-Agent": UA, "Accept": accept}
    hdr.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=hdr, method=method)
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect())
    t0 = time.time()
    try:
        with opener.open(req, timeout=timeout) as r:
            body = r.read(4_000_000)
            return r.status, {k.lower(): v for k, v in r.headers.items()}, body.decode("utf-8", "replace"), time.time() - t0
    except urllib.error.HTTPError as e:
        try:
            body = e.read(4_000_000).decode("utf-8", "replace")
        except Exception:
            body = ""
        return e.code, {k.lower(): v for k, v in e.headers.items()}, body, time.time() - t0
    except Exception as e:  # network failure, timeout, TLS
        return 0, {}, "%s: %s" % (type(e).__name__, e), time.time() - t0


class Fetcher:
    def __init__(self):
        self.cache = {}

    def get(self, url, accept="text/html"):
        k = (url, accept)
        if k not in self.cache:
            self.cache[k] = http(url, accept)
        return self.cache[k]


# ----------------------------------------------------------------------------------------- html
class Head(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = None
        self._in_title = False
        self.meta = {}
        self.canonical = None
        self.h1 = 0
        self.links = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "title" and self.title is None:
            self._in_title = True
            self.title = ""
        elif tag == "meta":
            key = a.get("name") or a.get("property")
            if key and "content" in a:
                self.meta.setdefault(key.lower(), a["content"])
        elif tag == "link" and (a.get("rel") or "").lower() == "canonical":
            self.canonical = a.get("href")
        elif tag == "h1":
            self.h1 += 1
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"])

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title and self.title is not None:
            self.title += data


def norm_url(u):
    p = urllib.parse.urlsplit(u)
    return "%s://%s%s" % (p.scheme, p.netloc.lower(), p.path.rstrip("/"))


def page_fields(url, status, headers, body, secs, expect_status):
    """Returns [(field, detail)] for the page checks of one URL."""
    out = []
    if status != expect_status:
        out.append(("status", "expected %d got %d" % (expect_status, status)))
        return out
    if secs >= 5:
        out.append(("time", "%.1f s (limit 5 s)" % secs))
    if expect_status != 200 or "text/html" not in headers.get("content-type", ""):
        return out
    p = Head()
    try:
        p.feed(body)
    except Exception:
        pass
    t = (p.title or "").strip()
    if not t:
        out.append(("title", "missing"))
    elif len(t) > 70:
        out.append(("title", "%d chars (limit 70)" % len(t)))
    d = p.meta.get("description", "").strip()
    if not d:
        out.append(("description", "missing"))
    elif not 50 <= len(d) <= 160:
        out.append(("description", "%d chars (need 50-160)" % len(d)))
    if not p.canonical:
        out.append(("canonical", "missing"))
    elif norm_url(urllib.parse.urljoin(url, p.canonical)) != norm_url(url):
        out.append(("canonical", "%s is not self" % p.canonical))
    for og in ("og:title", "og:description", "og:image"):
        if not p.meta.get(og, "").strip():
            out.append((og, "missing"))
    if p.h1 != 1:
        out.append(("h1", "%d h1 elements (need exactly 1)" % p.h1))
    return out


# ----------------------------------------------------------------------------------------- crawl
def count_sources(fetch, base, provek):
    """family pattern -> member count from a sitemap or registry source; absent key = no source."""
    out = {}
    st, _, sm, _ = fetch.get(base + "/sitemap.xml", "application/xml")
    locs = re.findall(r"<loc>([^<]+)</loc>", sm) if st == 200 else []
    st, _, gs, _ = fetch.get(base + "/guides/sitemap-guides.xml", "application/xml")
    glocs = re.findall(r"<loc>([^<]+)</loc>", gs) if st == 200 else []
    allv = [urllib.parse.urlsplit(u).path for u in locs + glocs]
    # Families with no reliable sitemap/registry source (month archives, platforms, per-shop files) are
    # checked on their sample URLs only; their listed count is documentation, not a measured claim.
    out["/guides/<slug>"] = len({p for p in allv if re.fullmatch(r"/guides/[a-z0-9][a-z0-9-]*", p)
                                 and not re.fullmatch(r"/guides/\d{4}-\d{2}", p)})
    st, _, shops, _ = fetch.get(base + "/api/v1/shop/shops", "application/json")
    if st == 200:
        try:
            out["/m/<shop-slug>"] = len(json.loads(shops)["shops"])
        except Exception:
            pass
    st, _, tpl, _ = fetch.get(provek + "/data/templates.json", "application/json")
    if st == 200:
        try:
            j = json.loads(tpl)
            n = len(j["templates"]) if isinstance(j, dict) and "templates" in j else len(j)
            for fam in ("/build/<template>/index.md", "/build/<template>/", "/build/<template>/SKILL.md",
                        "/data/templates/<template>.json"):
                out[fam] = n
        except Exception:
            pass
    return out


def crawl(root, base, provek, fetch, bodies):
    fails = []
    path = os.path.join(root, "config/pages-to-monitor.txt")
    if not os.path.isfile(path):
        return [("DOCS:page:config:pages-to-monitor", "config/pages-to-monitor.txt missing")]
    counts = count_sources(fetch, base, provek)
    for line in open(path, encoding="utf-8").read().split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if parts[0] == "family":
            pattern, listed, samples = parts[1], int(parts[2]), parts[3:]
            if pattern in counts and counts[pattern] != listed:
                fails.append(("DOCS:page:%s:family-count" % pattern,
                              "expected %d members got %d" % (listed, counts[pattern])))
            for s in samples:
                check_one(s, 200, fetch, bodies, fails)
            continue
        check_one(parts[0], int(parts[1]) if len(parts) > 1 else 200, fetch, bodies, fails)
    return fails


def check_one(url, expect_status, fetch, bodies, fails):
    st, hd, body, secs = fetch.get(url, "*/*")
    if st in (404, 406) and expect_status == 200 and re.search(r"\.md$", urllib.parse.urlsplit(url).path):
        # A `.md` URL that is not routed may still be served as the markdown twin of its page.
        twin = re.sub(r"(/index)?\.md$", "", url) or url
        s2, h2, b2, t2 = fetch.get(twin, "text/markdown")
        if s2 == 200 and "text/markdown" in h2.get("content-type", ""):
            st, hd, body, secs = s2, h2, b2, t2
    bodies[url] = (st, hd, body)
    key = urllib.parse.urlsplit(url)
    pth = key.path or "/"
    if key.netloc != "apibase.pro":
        pth = "%s%s" % (key.netloc, pth)
    for field, detail in page_fields(url, st, hd, body, secs, expect_status):
        fails.append(("DOCS:page:%s:%s" % (pth, field), "%s %s" % (url, detail)))


URL_RE = re.compile(r"https?://[A-Za-z0-9.-]+(?:/[^\s\"'<>)\]\\`]*)?")


def link_check(root, bodies, hosts_file, facts):
    fails = []
    if not os.path.isfile(hosts_file):
        return fails
    hosts = [h.strip().lower() for h in open(hosts_file).read().split("\n") if h.strip() and not h.startswith("#")]

    def watched(u):
        h = urllib.parse.urlsplit(u).hostname or ""
        return any(h == x or h.endswith("." + x) for x in hosts)

    urls = {}
    texts = [b[2] for b in bodies.values() if b[0] == 200]
    for rel in ("README.md", "SECURITY.md"):
        p = os.path.join(root, rel)
        if os.path.isfile(p):
            texts.append(open(p, encoding="utf-8", errors="replace").read())
    for dp, _, fs in os.walk(os.path.join(root, "docs")):
        for f in fs:
            if f.endswith(".md"):
                texts.append(open(os.path.join(dp, f), encoding="utf-8", errors="replace").read())
    for t in texts:
        for u in URL_RE.findall(t):
            u = u.rstrip(".,;:")
            if watched(u):
                urls.setdefault(urllib.parse.urlsplit(u).hostname, u)
    gl = facts.get("genlayer", {})
    for k in ("explorer_host", "rpc_host"):
        if gl.get(k) and watched("https://" + gl[k]):
            urls.setdefault(gl[k], "https://%s/" % gl[k])
    for host in sorted(urls):
        st, hd, _, _ = http(urls[host], follow=False, method="GET")
        if 300 <= st < 400:
            fails.append(("DOCS:link:3xx:%s" % host, "%s answers %d to %s" % (urls[host], st, hd.get("location", "?"))))
    return fails


def eth_get_code(rpc_host, address):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_getCode", "params": [address, "latest"]}).encode()
    st, _, txt, _ = http("https://%s" % rpc_host, accept="application/json", method="POST", data=body,
                         headers={"Content-Type": "application/json"})
    if st != 200:
        return None, "RPC %s answered %d" % (rpc_host, st)
    try:
        return json.loads(txt).get("result"), ""
    except Exception:
        return None, "RPC %s returned non-JSON" % rpc_host


def genlayer_check(provek, facts, fetch):
    fails = []
    gl = facts.get("genlayer", {})
    if gl.get("rpc_host") and gl.get("contract_address"):
        code, why = eth_get_code(gl["rpc_host"], gl["contract_address"])
        if code is None or code in ("0x", "0x0"):
            fails.append(("DOCS:genlayer:attest:no-code", why or "eth_getCode(%s) = %s on %s" % (gl["contract_address"], code, gl["rpc_host"])))
    st, _, body, _ = fetch.get(provek + "/.well-known/agent-registration.json", "application/json")
    m = re.search(r"/address/(0x[0-9a-fA-F]{40})", body) or re.search(r"0x[0-9a-fA-F]{40}", body) if st == 200 else None
    if not m:
        fails.append(("DOCS:genlayer:witness:no-code", "no witness contract address in provek agent-registration.json (HTTP %d)" % st))
    elif gl.get("rpc_host"):
        addr = m.group(1) if m.groups() else m.group(0)
        code, why = eth_get_code(gl["rpc_host"], addr)
        if code is None or code in ("0x", "0x0"):
            fails.append(("DOCS:genlayer:witness:no-code", why or "eth_getCode(%s) = %s on %s" % (addr, code, gl["rpc_host"])))
    return fails


def agentready_check(base, fetch):
    fails = []
    st, hd, _, _ = http(base + "/", accept="text/html")
    if "link" not in hd:
        fails.append(("DOCS:agentready:link-header", "no Link header on %s/ (HTTP %d)" % (base, st)))
    st, hd, _, _ = http(base + "/", accept="text/markdown")
    if "text/markdown" not in hd.get("content-type", ""):
        fails.append(("DOCS:agentready:markdown-negotiation", "Accept: text/markdown on / returned %s" % hd.get("content-type", "nothing")))
    st, _, body, _ = fetch.get(base + "/.well-known/api-catalog", "application/linkset+json")
    ok = False
    if st == 200:
        try:
            ok = "linkset" in json.loads(body)
        except Exception:
            ok = False
    if not ok:
        fails.append(("DOCS:agentready:api-catalog", "/.well-known/api-catalog HTTP %d, linkset %s" % (st, "present" if ok else "missing")))
    st, _, body, _ = fetch.get(base + "/.well-known/agent-skills/index.json", "application/json")
    try:
        skills = json.loads(body)["skills"] if st == 200 else []
    except Exception:
        skills = []
    if not skills:
        fails.append(("DOCS:agentready:skills-index", "agent-skills/index.json HTTP %d, no skills" % st))
    for sk in skills:
        s2, _, b2, _ = fetch.get(sk.get("url", ""), "text/markdown")
        digest = hashlib.sha256(b2.encode("utf-8")).hexdigest() if s2 == 200 else None
        want = str(sk.get("sha256", "")).replace("sha256:", "")
        if digest != want:
            fails.append(("DOCS:agentready:skills-hash", "%s served sha256 %s, index says %s" % (sk.get("name"), digest, want)))
    return fails


# ----------------------------------------------------------------------------------------- live
def check_live(root, base, provek, facts_local):
    fetch = Fetcher()
    fails = []
    notes = []
    st, _, body, _ = fetch.get(base + "/.well-known/site-facts.json", "application/json")
    facts = None
    if st == 200:
        try:
            facts = json.loads(body)
        except Exception:
            facts = None
    if facts is None:
        notes.append("site-facts: live facts unavailable (HTTP %d), using the tree copy" % st)
        facts = facts_local
    rows = load_claims(root)
    stale_lines = []
    for row in rows:
        url = row["url"]
        raw = url.startswith("raw:")
        target = url[4:] if raw else url
        status, hd, text, _ = fetch.get(target)
        if status != 200:
            stale_lines.append(stale(row, row["surface"], ("HTTP 200 from " + target, "HTTP %d" % status)))
            continue
        res = eval_row(row, text, facts)
        if res:
            stale_lines.append(stale(row, row["surface"], res))
        if (not raw and row["surface"].endswith(".html") and row["kind"] in ("must-not-contain", "tool-ids-healthy")):
            s2, h2, t2, _ = fetch.get(target, "text/markdown")
            if s2 == 200 and "text/markdown" in h2.get("content-type", ""):
                res = eval_row(row, t2, facts)
                if res:
                    stale_lines.append(stale(row, row["surface"] + " [markdown]", res))
    bodies = {}
    extra = crawl(root, base, provek, fetch, bodies)
    extra += link_check(root, bodies, os.path.join(root, "config/link-hosts-no-3xx.txt"), facts)
    extra += genlayer_check(provek, facts, fetch)
    extra += agentready_check(base, fetch)
    return notes, stale_lines, extra


def main(argv):
    if not argv or argv[0] not in ("check", "check-live"):
        print(__doc__)
        return 2
    cmd = argv[0]
    opts = {"--root": os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "--base": "https://apibase.pro", "--provek": "https://provek.dev"}
    i = 1
    while i < len(argv):
        if argv[i] in opts and i + 1 < len(argv):
            opts[argv[i]] = argv[i + 1]
            i += 2
        else:
            print("site-facts: unknown argument %s" % argv[i])
            return 2
    root = opts["--root"]
    fp = os.path.join(root, "static/.well-known/site-facts.json")
    if not os.path.isfile(fp):
        print("site-facts: static/.well-known/site-facts.json missing (run npx tsx scripts/gen-site-facts.ts)")
        return 1
    facts = json.load(open(fp, encoding="utf-8"))
    if cmd == "check":
        fails, live_only = check_offline(root, facts, load_claims(root))
        for f in fails:
            print(f)
        print("site-facts: %d failures (%d live-only rows not evaluated)" % (len(fails), live_only))
        return 1 if fails else 0
    notes, stale_lines, extra = check_live(root, opts["--base"].rstrip("/"), opts["--provek"].rstrip("/"), facts)
    for n in notes:
        print(n)
    for f in stale_lines:
        print(f)
    for key, detail in extra:
        print("%s %s" % (key, one_line(detail, 200)))
    total = len(stale_lines) + len(extra)
    print("site-facts: %d failures" % total)
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
