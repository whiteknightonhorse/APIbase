#!/usr/bin/env python3
"""T-INT-19 (F-3, §1, §7.4, §13.4): Integrator facts on the public surfaces, one source.

Source: the `integrator` block + `merchants_count` of static/.well-known/mcp.json (written by
scripts/gen-discovery.ts from env / one SQL). Tokens: MERCHANTS_COUNT, INTEGRATOR_FEE_PCT,
INTEGRATOR_MIN_ORDER, SANDBOX_STATUS, LEGAL_STATUS (legal-published.json), STREAM_CLOSE_GRACE_S (`integrator.stream_close_grace_s`), LEGAL_LATEST_EFFECTIVE (max effective_from of static/legal/*.md, inside LEGAL_STATUS).

  render  rewrite the Integrator sentence in the nginx-static surfaces (pricing.html, llms.txt)
  check   read-only; exit 1 on any disagreement (used by sync-counts.sh in both modes)

/integrator/* pages are rendered at request time (src/shop/integrator/tokens.ts) and must keep
the {{TOKEN}} placeholders -- a hardcoded number there is drift, `check` fails on it.
"""
import glob
import json
import os
import re
import sys

MCP = "static/.well-known/mcp.json"
RENDERED = ["static/pricing.html", "static/llms.txt"]
TOKEN_FILES = {
    "static/integrator/index.html": [
        "INTEGRATOR_FEE_PCT", "MERCHANTS_COUNT", "INTEGRATOR_MIN_ORDER", "SANDBOX_STATUS",
        "LEGAL_STATUS_HTML",
    ],
    "static/integrator/llms.txt": ["INTEGRATOR_FEE_PCT", "MERCHANTS_COUNT"],
    "static/integrator/index.md": ["MERCHANTS_COUNT", "LEGAL_STATUS"],
    "static/integrator/connect.html": ["LEGAL_STATUS_HTML"],
    "static/integrator/buyers.md": ["STREAM_CLOSE_GRACE_S"],
}
# Homepage surfaces are static files (no request-time tokens): the fee phrase and the merchants line
# sit between comment markers and are rendered here from the same baseline. Zero merchants -> the
# merchants block is rendered empty (no number shown).
HOME_FILES = ["static/index.html", "static/index.md"]
HOME_FEE_RE = re.compile(r"<!--fee-->.*?<!--/fee-->")
HOME_MERCH_RE = re.compile(r"<!--merchants-->.*?<!--/merchants-->", re.S)
SENTENCE_RE = re.compile(r"Integrator: [^<\n]*? invoiced(?: otherwise)?\.")
MERCHANTS_RE = re.compile(r"Merchants connected: [0-9]+\.(?: \(the public /shops index lists only shops with a verified domain\)\.?)?")
FEE_STATE_RE = re.compile(r"<!--fee-state-->.*?<!--/fee-state-->")


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
        "grace_s": int(ig["stream_close_grace_s"]),
    }


def sentence(f):
    return (
        "Integrator: %s fee from the merchant, min %s, orders from %s; "
        "on Tempo inside the transaction, on Base inside the transaction for clients that support fee-split and invoiced otherwise." % (f["fee"], f["fee_min"], f["min_order"])
    )


def fee_state(f):
    return "<!--fee-state-->Integrator fee: %s. Fee Switch state is published here per Merchant Agreement &sect;9.<!--/fee-state-->" % f["fee"]


def merchants_line(f):
    return "Merchants connected: %d. (the public /shops index lists only shops with a verified domain)." % f["merchants"]


def home_fee(f):
    return "<!--fee-->%s<!--/fee-->" % ("0% fee during the pilot" if f["fee"] == "0% (pilot)" else f["fee"] + " fee")


def home_merchants(f, path):
    if f["merchants"] < 1:
        return "<!--merchants--><!--/merchants-->"
    line = "Merchants connected so far: %d." % f["merchants"]
    if path.endswith(".html"):
        line = "<p>%s</p>" % line
    return "<!--merchants-->%s<!--/merchants-->" % line


# T-0820: static/index.md is served raw, so it carries no comment markers; the fee phrase and the
# merchants count are found by the words around them (one capture group each, exactly one match).
# index.md shows the count also when it is zero.
HOME_MD_FILE = "static/index.md"
HOME_MD_ANCHORS = [
    ("fee", re.compile(r"USDC settles to your wallet\. (.+?)\.$", re.M)),
    ("merchants", re.compile(r"^Merchants connected so far: (\d+)\.$", re.M)),
]


def home_md_value(tok, f):
    if tok == "fee":
        return "0% fee during the pilot" if f["fee"] == "0% (pilot)" else f["fee"] + " fee"
    return str(f["merchants"])


def render_home_md(s, f):
    for tok, rx in HOME_MD_ANCHORS:
        v = home_md_value(tok, f)
        s = rx.sub(lambda m, v=v: m.group(0)[: m.start(1) - m.start()] + v + m.group(0)[m.end(1) - m.start():], s)
    return s


def check_home_md(f):
    problems = []
    s = open(HOME_MD_FILE).read()
    for tok, rx in HOME_MD_ANCHORS:
        n = len(rx.findall(s))
        if n != 1:
            problems.append("%s: anchor for token %s matches %d times (want 1); the words around the value were edited" % (HOME_MD_FILE, tok, n))
    if render_home_md(s, f) != s:
        problems.append("%s: fee phrase or merchants count differs from the mcp.json baseline" % HOME_MD_FILE)
    return problems


def render_home(s, f, path):
    if path.endswith(".md"):
        return render_home_md(s, f)
    s = HOME_FEE_RE.sub(lambda m: home_fee(f), s)
    return HOME_MERCH_RE.sub(lambda m: home_merchants(f, path), s)


def render():
    f = facts()
    for path in HOME_FILES:
        s = open(path).read()
        n = render_home(s, f, path)
        if n != s:
            open(path, "w").write(n)
            print("  updated %s (home integrator facts)" % path)
    for path in RENDERED:
        s = open(path).read()
        n = SENTENCE_RE.sub(lambda m: sentence(f), s)
        if path.endswith("pricing.html"):
            n = FEE_STATE_RE.sub(lambda m: fee_state(f), n)
        if path.endswith("llms.txt"):
            n = MERCHANTS_RE.sub(lambda m: merchants_line(f), n)
        if n != s:
            open(path, "w").write(n)
            print("  updated %s (integrator facts)" % path)


def check():
    f = facts()
    problems = check_home_md(f)
    for path in RENDERED:
        s = open(path).read()
        found = SENTENCE_RE.findall(s)
        if found != [sentence(f)]:
            problems.append("%s: Integrator sentence %r != expected %r" % (path, found, sentence(f)))
        if path.endswith("pricing.html") and FEE_STATE_RE.findall(s) != [fee_state(f)]:
            problems.append("%s: fee-state line differs from the mcp.json baseline" % path)
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
    for path in HOME_FILES:
        s = open(path).read()
        if render_home(s, f, path) != s:
            problems.append("%s: fee phrase / merchants line differ from the mcp.json baseline" % path)
        if "/integrator" not in s or "Integrator" not in s:
            problems.append("%s: Integrator block or /integrator link missing" % path)
        if re.search(r"1[.,]5 ?%", s) and f["fee"] != "1.5%":
            problems.append("%s: hardcoded 1.5%% fee" % path)
    for path in glob.glob("static/integrator/**", recursive=True):
        if os.path.isfile(path):
            s = open(path).read()
            for lit in ("not yet published", "may still be drafts", "Published on"):
                if lit in s:
                    problems.append("%s: hardcoded legal status %r (use {{LEGAL_STATUS}})" % (path, lit))
    # T-0534: the published sentence carries the latest effective date from the legal index, not a literal.
    tokens_ts = open("src/shop/integrator/tokens.ts").read()
    if "LEGAL_LATEST_EFFECTIVE" not in tokens_ts or "latest effective ${legalLatestEffective()}" not in tokens_ts:
        problems.append("src/shop/integrator/tokens.ts: LEGAL_LATEST_EFFECTIVE token / published sentence missing")
    for path in TOKEN_FILES:
        s = open(path).read()
        if re.search(r"\b%d\b" % f["grace_s"], s):
            problems.append("%s: hardcoded grace period %d (use the token)" % (path, f["grace_s"]))
        if f["fee"] in s.replace("{{INTEGRATOR_FEE_PCT}}", ""):
            problems.append("%s: hardcoded fee %r (use the token)" % (path, f["fee"]))
    if problems:
        print("\n".join(problems))
        sys.exit(1)


if __name__ == "__main__":
    {"render": render, "check": check}[sys.argv[1]]()
