#!/usr/bin/env python3
"""T-INT-19 (F-3, §1, §7.4, §13.4): Integrator facts on the public surfaces, one source.

Source: the `integrator` block + `merchants_count` of static/.well-known/mcp.json (written by
scripts/gen-discovery.ts from env / one SQL). Tokens: MERCHANTS_COUNT, INTEGRATOR_FEE_PCT,
INTEGRATOR_MIN_ORDER, SANDBOX_STATUS.

  render  rewrite the Integrator sentence in the nginx-static surfaces (pricing.html, llms.txt)
  check   read-only; exit 1 on any disagreement (used by sync-counts.sh in both modes)

/integrator/* pages are rendered at request time (src/shop/integrator/tokens.ts) and must keep
the {{TOKEN}} placeholders -- a hardcoded number there is drift, `check` fails on it.
"""
import json
import re
import sys

MCP = "static/.well-known/mcp.json"
RENDERED = ["static/pricing.html", "static/llms.txt"]
TOKEN_FILES = {
    "static/integrator/index.html": [
        "INTEGRATOR_FEE_PCT", "MERCHANTS_COUNT", "INTEGRATOR_MIN_ORDER", "SANDBOX_STATUS",
    ],
    "static/integrator/llms.txt": ["INTEGRATOR_FEE_PCT", "MERCHANTS_COUNT"],
    "static/integrator/index.md": ["MERCHANTS_COUNT"],
}
SENTENCE_RE = re.compile(r"Integrator: [^<\n]*? invoiced\.")
MERCHANTS_RE = re.compile(r"Merchants connected: [0-9]+\.")


def facts():
    d = json.load(open(MCP))
    ig = d["integrator"]
    pct = ig["fee_pct"]
    fee = "%g%%" % pct if ig["fee_enabled"] else "0% (pilot)"
    return {
        "merchants": int(d["merchants_count"]),
        "fee": fee,
        "fee_min": "$%.2f" % ig["fee_min_usd"],
        "min_order": "$%.2f" % ig["min_order_usd"],
    }


def sentence(f):
    return (
        "Integrator: %s fee from the merchant, min %s, orders from %s; "
        "on Tempo inside the transaction, on Base invoiced." % (f["fee"], f["fee_min"], f["min_order"])
    )


def merchants_line(f):
    return "Merchants connected: %d." % f["merchants"]


def render():
    f = facts()
    for path in RENDERED:
        s = open(path).read()
        n = SENTENCE_RE.sub(lambda m: sentence(f), s)
        if path.endswith("llms.txt"):
            n = MERCHANTS_RE.sub(lambda m: merchants_line(f), n)
        if n != s:
            open(path, "w").write(n)
            print("  updated %s (integrator facts)" % path)


def check():
    f = facts()
    problems = []
    for path in RENDERED:
        s = open(path).read()
        found = SENTENCE_RE.findall(s)
        if found != [sentence(f)]:
            problems.append("%s: Integrator sentence %r != expected %r" % (path, found, sentence(f)))
        if path.endswith("llms.txt"):
            if "/integrator" not in s:
                problems.append("%s: no /integrator link" % path)
            found = MERCHANTS_RE.findall(s)
            if found != [merchants_line(f)]:
                problems.append("%s: merchants line %r != %r" % (path, found, merchants_line(f)))
    for path, tokens in TOKEN_FILES.items():
        s = open(path).read()
        for t in tokens:
            if "{{%s}}" % t not in s:
                problems.append("%s: token {{%s}} missing (hardcoded number?)" % (path, t))
        if re.search(r"Merchants connected so far: *[0-9]", s):
            problems.append("%s: hardcoded merchants count" % path)
    for path in list(TOKEN_FILES) + RENDERED:
        s = open(path).read()
        if re.search(r"1[.,]5 ?%", s) and f["fee"] != "1.5%":
            problems.append("%s: hardcoded 1.5%% fee" % path)
    for path in TOKEN_FILES:
        s = open(path).read()
        if f["fee"] in s.replace("{{INTEGRATOR_FEE_PCT}}", ""):
            problems.append("%s: hardcoded fee %r (use the token)" % (path, f["fee"]))
    if problems:
        print("\n".join(problems))
        sys.exit(1)


if __name__ == "__main__":
    {"render": render, "check": check}[sys.argv[1]]()
