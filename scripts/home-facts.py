#!/usr/bin/env python3
"""T-INT-27: homepage / ai.txt / index.md numbers come from one source (sync-counts).

Source: static/.well-known/mcp.json (tools_count, providers_count,
categories_count, price_range_usd), the same baseline sync-counts.sh uses. Tools and providers
phrases are rewritten by sync-counts.sh's own sed pass; this script owns the rest of the shapes
(categories, price range, "N separate provider integrations", JSON-LD low/high price).

  render  rewrite those shapes in place
  check   read-only; exit 1 on any disagreement (used by sync-counts.sh in both modes)
  check-bar    STALE_HEADER_BAR: exit 1 if any header bar differs from the generated one
  check-range  STALE_PRICE_RANGE: exit 1 if any static/ file carries another global price range
  lint F  print every number of 2+ digits in F that is neither a token carrying the baseline
          value nor on the allow-list (years, HTTP codes, ids); exit 1 if any
"""
import json
import os
import re
import sys

MCP = "static/.well-known/mcp.json"
FILES = [
    "static/index.html", "static/index.md", "static/ai.txt", "static/llms.txt", "static/pricing.html",
    "static/.well-known/x402-payment.json",
    "static/.well-known/agent-skills/x402-payment.md",
]
# T-0341: pages whose header sys-monitor bar is generated (SYSTEM ... sys-cursor), and the pages
# where only the PRICE value of a hand-laid-out bar is generated.
BAR_PAGES = [
    "static/index.html", "static/terms.html", "static/privacy.html", "static/contact.html",
    "static/policy-moderation.html",
]
BAR_PRICE_ONLY = ["static/pricing.html"]
BAR_RE = re.compile(r'<span class="label">SYSTEM</span>.*?(?=<span class="sys-cursor">)', re.S)
BAR_PRICE_RE = re.compile(r'(?<=<span class="label">PRICE:</span><strong>)[^<]*')
INTEGRATOR_BAR = "static/integrator/index.html"
INTEGRATOR_BAR_RE = re.compile(r'<div class="sys-monitor">.*?</div>', re.S)
INTEGRATOR_BAR_HTML = (
    '<div class="sys-monitor"><span class="prompt">></span> <span class="label">MODE:</span>'
    '<strong>integrator</strong>  <span class="label">FEE:</span><strong>{{INTEGRATOR_FEE_PCT}}</strong>'
    '  <span class="label">MIN:</span><strong>{{INTEGRATOR_MIN_ORDER}}</strong>'
    '  <span class="label">RAILS:</span><strong>x402+MPP</strong></div>'
)


def facts():
    d = json.load(open(MCP))
    pr = d["price_range_usd"]
    return {
        "tools": int(d["tools_count"]),
        "providers": int(d["providers_count"]),
        "categories": int(d["categories_count"]),
        "pmin": "%g" % pr["min"],
        "pmax": "%g" % pr["max"],
        "range": pr["text"],
    }


def html_range(f):
    return f["range"].replace("<", "&lt;")


def canonical_bar(f):
    """The one header bar: PRV / TOOLS / PRICE / PAY, generated from the baseline."""
    return (
        '<span class="label">SYSTEM</span>  <span class="label">PRV:</span><strong>%d</strong>'
        '  <span class="label">TOOLS:</span><strong>%d</strong>'
        '  <span class="label">PRICE:</span><strong>%s</strong>'
        '  <span class="label">PAY:</span><strong>x402+MPP</strong>'
    ) % (f["providers"], f["tools"], html_range(f))


def money(x):
    return "$%s" % x


# (regex, callable(facts, match) -> replacement); each regex isolates the number(s) it owns.
def _price(f, m):
    star = "**" if m.group(0).startswith("**") else ""
    return "%s%s%s%s" % (star, money(f["pmin"]), m.group(1), money(f["pmax"]))


# "$a–$b per call" with its optional parenthetical (p90 clause, or the retired "most tools" one).
RANGE_FULL = (
    r"\$0\.\d+–\$\d+(?:\.\d+)? per call"
    r"(?: \((?:90% of tools (?:<=|&lt;=) \$\d+(?:\.\d+)?|most tools \$\d+(?:\.\d+)?–\$\d+(?:\.\d+)?)\))?"
)


def _range_full(f, m):
    return html_range(f) if "&lt;" in m.group(0) else f["range"]


RULES = [
    (re.compile(r"\d+\+?(?= (?:more )?categories)"), lambda f, m: str(f["categories"])),
    (re.compile(r"(?<=ategories \()\d+(?=\))"), lambda f, m: str(f["categories"])),
    (re.compile(r"\d+(?= separate provider integrations)"), lambda f, m: str(f["providers"])),
    (re.compile(RANGE_FULL), _range_full),
    (re.compile(r"(?<=from )(?:\*\*)?\$\d+(?:\.\d+)?(–| to )\$\d+(?:\.\d+)?"), _price),
    (re.compile(r'(?<="min_usd": ")[0-9.]+'), lambda f, m: f["pmin"]),
    (re.compile(r'(?<="max_usd": ")[0-9.]+'), lambda f, m: f["pmax"]),
    (re.compile(r'(?<="lowPrice":")[0-9.]+'), lambda f, m: f["pmin"]),
    (re.compile(r'(?<="highPrice":")[0-9.]+'), lambda f, m: f["pmax"]),
]
# tools/providers phrases sync-counts.sh maintains: lint only verifies their value.
COUNT_RULES = [
    (re.compile(r"\d+(?= tools\b)"), "tools"),
    (re.compile(r"\d+(?= providers\b)"), "providers"),
    (re.compile(r"(?<=Tools: )\d+"), "tools"),
    (re.compile(r"(?<=PRV: <strong>)\d+"), "providers"),
    (re.compile(r"(?<=TOOLS: <strong>)\d+"), "tools"),
    (re.compile(r"(?<=TOOLS: )\d+"), "tools"),
    (re.compile(r'(?<="offerCount":")\d+'), "tools"),
]


def rendered(s, f, path=""):
    for rx, fn in RULES:
        s = rx.sub(lambda m, fn=fn: fn(f, m), s)
    if path in BAR_PAGES:
        s = BAR_RE.sub(lambda m: canonical_bar(f), s)
    if path in BAR_PRICE_ONLY:
        s = BAR_PRICE_RE.sub(lambda m: html_range(f), s)
    if path == INTEGRATOR_BAR:
        s = INTEGRATOR_BAR_RE.sub(lambda m: INTEGRATOR_BAR_HTML, s, count=1)
    return s


def rendered_files():
    return [p for p in FILES + BAR_PAGES + BAR_PRICE_ONLY + [INTEGRATOR_BAR] if os.path.exists(p)]


def render():
    f = facts()
    for path in dict.fromkeys(rendered_files()):
        s = open(path).read()
        n = rendered(s, f, path)
        if n != s:
            open(path, "w").write(n)
            print("  updated %s (home facts)" % path)


def check():
    f = facts()
    problems = []
    for path in FILES:
        if not os.path.exists(path):
            continue
        s = open(path).read()
        if rendered(s, f) != s:
            problems.append("%s: categories/price/provider-integration numbers differ from mcp.json" % path)
    if problems:
        print("\n".join(problems))
        sys.exit(1)


def check_bar():
    """STALE_HEADER_BAR: every generated bar must equal the canonical one."""
    f = facts()
    problems = []
    for path in BAR_PAGES + BAR_PRICE_ONLY + [INTEGRATOR_BAR]:
        s = open(path).read()
        if rendered(s, f, path) != s:
            problems.append("%s: header bar differs from the generated one" % path)
    if problems:
        print("\n".join(problems))
        sys.exit(1)


RANGE_ANY = re.compile(r"\$(0\.\d+)\s?(?:–|&ndash;|-| to )\s?\$(\d+(?:\.\d+)?)")


def check_range():
    """STALE_PRICE_RANGE: no static/ file may carry a global range other than the generated one."""
    f = facts()
    pmin, pmax = float(f["pmin"]), float(f["pmax"])
    problems = []
    for root, _dirs, names in os.walk("static"):
        for name in names:
            path = os.path.join(root, name)
            if not name.endswith((".html", ".md", ".txt", ".json", ".xml")) and name != "ucp":
                continue
            try:
                s = open(path, encoding="utf-8").read()
            except (UnicodeDecodeError, OSError):
                continue
            for m in RANGE_ANY.finditer(s):
                lo, hi = float(m.group(1)), float(m.group(2))
                if lo <= max(pmin, 0.001) and (lo != pmin or hi != pmax):
                    problems.append("%s: %s != generated $%s–$%s" % (path, m.group(0), f["pmin"], f["pmax"]))
    if problems:
        print("\n".join(problems))
        sys.exit(1)


NUM = re.compile(r"(?<![\w.])\d+(?:,\d{3})*(?:\.\d+)?\+?")
ALLOW_CTX = [  # numbers legitimately outside the counters
    r"HTTP 402", r"402 Payment Required", r"402 payment", r"\b20\d\d(?:-\d\d-\d\d)?\b", r"chain 4217",
    r"32 hex", r"\{32hex\}", r"eip155:8453", r"0x[0-9a-fA-F]+", r"v\d+(?:\.\d+)*",
    r"https?://\S+", r"/[A-Za-z0-9_./-]*\d[A-Za-z0-9_./-]*", r"RFC \d+", r"SEP-\d+",
    r"OpenAPI 3\.1", r"p\d\d(?:/p\d\d)?", r"Merchants connected so far: \d+",
]


def lint(path):
    f = facts()
    s = open(path).read()
    s = re.sub(r"<style\b.*?</style>", " ", s, flags=re.S)
    s = re.sub(r"<!--.*?-->", " ", s, flags=re.S)
    # scripts: only prose-like numbers ("1389 tools", "$0.001"), not timers/pixel math
    s = re.sub(
        r"<script\b.*?</script>",
        lambda m: " ".join(re.findall(r"\$\d[\d.]*(?:(?:–| to )\$\d[\d.]*)?|\d[\d.,]*\+? (?:more )?[A-Za-z]+", m.group(0))),
        s, flags=re.S,
    )
    s = re.sub(r"<(?!/?(?:strong|code)\b)[A-Za-z/!][^>]*>", " ", s)  # drop tag attributes (urls, css, ids)
    bad = []
    spans = []  # (start, end) of accepted tokens
    for rx, key in COUNT_RULES:
        for m in rx.finditer(s):
            spans.append((m.start(), m.end()))
            if int(m.group(0)) != f[key]:
                bad.append("%s: %s != baseline %s (%s)" % (path, m.group(0), f[key], key))
    for rx, fn in RULES:
        for m in rx.finditer(s):
            spans.append((m.start(), m.end()))
            if fn(f, m) != m.group(0):
                bad.append("%s: %r != baseline %r" % (path, m.group(0), fn(f, m)))
    for rx in ALLOW_CTX:
        for m in re.finditer(rx, s):
            spans.append((m.start(), m.end()))
    for m in NUM.finditer(s):
        digits = re.sub(r"\D", "", m.group(0))
        if len(digits) < 2:
            continue
        if any(a <= m.start() and m.end() <= b for a, b in spans):
            continue
        bad.append("%s: untokenized number %r near %r" % (path, m.group(0), s[max(0, m.start() - 25):m.end() + 15].replace("\n", " ")))
    if bad:
        print("\n".join(bad))
        sys.exit(1)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "render":
        render()
    elif cmd == "check":
        check()
    elif cmd == "check-bar":
        check_bar()
    elif cmd == "check-range":
        check_range()
    elif cmd == "lint" and len(sys.argv) > 2:
        lint(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(2)
