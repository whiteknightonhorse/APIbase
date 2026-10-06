#!/usr/bin/env python3
"""T-INT-27: homepage / ai.txt / index.md numbers come from one source (sync-counts).

Source: static/.well-known/mcp.json (tools_count - shop_tools_count, providers_count,
categories_count, price_range_usd), the same baseline sync-counts.sh uses. Tools and providers
phrases are rewritten by sync-counts.sh's own sed pass; this script owns the rest of the shapes
(categories, price range, "N separate provider integrations", JSON-LD low/high price).

  render  rewrite those shapes in place
  check   read-only; exit 1 on any disagreement (used by sync-counts.sh in both modes)
  lint F  print every number of 2+ digits in F that is neither a token carrying the baseline
          value nor on the allow-list (years, HTTP codes, ids); exit 1 if any
"""
import json
import re
import sys

MCP = "static/.well-known/mcp.json"
FILES = ["static/index.html", "static/index.md", "static/ai.txt"]


def facts():
    d = json.load(open(MCP))
    pr = d["price_range_usd"]
    return {
        "tools": int(d["tools_count"]) - int(d.get("shop_tools_count") or 0),
        "providers": int(d["providers_count"]),
        "categories": int(d["categories_count"]),
        "pmin": "%g" % pr["min"],
        "pmax": "%g" % pr["max"],
    }


def money(x):
    return "$%s" % x


# (regex, callable(facts, match) -> replacement); each regex isolates the number(s) it owns.
def _price(f, m):
    return "%s%s%s" % (money(f["pmin"]), m.group(1), money(f["pmax"]))


RULES = [
    (re.compile(r"\d+\+?(?= (?:more )?categories)"), lambda f, m: str(f["categories"])),
    (re.compile(r"(?<=ategories \()\d+(?=\))"), lambda f, m: str(f["categories"])),
    (re.compile(r"\d+(?= separate provider integrations)"), lambda f, m: str(f["providers"])),
    (re.compile(r"\$0\.001(–| to )\$\d+(?:\.\d+)?"), _price),
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


def rendered(s, f):
    for rx, fn in RULES:
        s = rx.sub(lambda m, fn=fn: fn(f, m), s)
    return s


def render():
    f = facts()
    for path in FILES:
        s = open(path).read()
        n = rendered(s, f)
        if n != s:
            open(path, "w").write(n)
            print("  updated %s (home facts)" % path)


def check():
    f = facts()
    problems = []
    for path in FILES:
        s = open(path).read()
        if rendered(s, f) != s:
            problems.append("%s: categories/price/provider-integration numbers differ from mcp.json" % path)
    if problems:
        print("\n".join(problems))
        sys.exit(1)


NUM = re.compile(r"(?<![\w.])\d+(?:,\d{3})*(?:\.\d+)?\+?")
ALLOW_CTX = [  # numbers legitimately outside the counters
    r"HTTP 402", r"402 Payment Required", r"402 payment", r"\b20\d\d(?:-\d\d-\d\d)?\b", r"chain 4217",
    r"32 hex", r"\{32hex\}", r"eip155:8453", r"0x[0-9a-fA-F]+", r"v\d+(?:\.\d+)*",
    r"https?://\S+", r"/[A-Za-z0-9_./-]*\d[A-Za-z0-9_./-]*", r"RFC \d+", r"SEP-\d+",
    r"OpenAPI 3\.1", r"p\d\d(?:/p\d\d)?",
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
    s = re.sub(r"<(?!/?(?:strong|code)\b)[^>]*>", " ", s)  # drop tag attributes (urls, css, ids)
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
    elif cmd == "lint" and len(sys.argv) > 2:
        lint(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(2)
