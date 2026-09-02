#!/usr/bin/env python3
"""
check-no-clipped-overflow.py -- T-60 (mobile comparison-table overflow, 2026-09-02).

Every static/*.html page wraps its content in `.window`, which sets
`overflow:hidden` (see each page's own inline <style>). Any wide element --
a <table>, a <pre> code block -- that isn't wrapped in its OWN horizontal
scroll container gets silently CLIPPED by `.window` on a narrow viewport
instead of becoming scrollable: the excess content is just gone, with no
scrollbar and no way to reach it. That is exactly the live defect reported
on an iPhone (Safari) for the homepage's "vs alternatives" comparison table:
the "Next steps" column was cut off and could not be scrolled to.

Root cause, confirmed by reading the markup + CSS (not assumed): `table{
width:100%}` is a target, not a hard cap -- per the CSS2 table-width
algorithm, if a cell's longest UNBREAKABLE token (e.g. "rapidapi.com",
"CRM/accounting") forces the table's min-content width past its container,
the table grows past 100% instead of shrinking. With no wrapper around it,
that excess bled straight into `.window`'s clip. pricing.html and
dashboard.html already solved this exact problem with a `.table-wrap
{overflow-x:auto}` div around their tables; index.html's table had no such
wrapper. connect.html/frameworks.html sidestep it differently: `pre{
overflow-x:auto}` is set on the tag itself, so every <pre> is already its
own scroll container.

This is a STATIC check (parses markup + each page's own inline CSS text) --
it does NOT drive a real browser at a narrow viewport. This sandbox's
browser tooling has proven unable to reproduce exact mobile widths (see the
T-60 task notes: three sessions of resize_window not landing the requested
width). It cannot compute real rendered pixel widths, so it does not
try to. Instead it enforces the structural invariant that actually fixes
this class of bug: every <table>/<pre> must be wrapped by an ancestor that
establishes its own horizontal scroll (overflow-x/overflow: auto|scroll)
strictly BEFORE any ancestor sets overflow:hidden. That invariant is
necessary and, per the two known-good pages above, sufficient in practice
on this site's own template family.

Run: python3 scripts/check-no-clipped-overflow.py            (checks static/*.html)
     python3 scripts/check-no-clipped-overflow.py --selftest  (unit tests, no disk I/O)
"""
import glob
import re
import sys
from html.parser import HTMLParser

RISKY_TAGS = {"table", "pre"}


def extract_overflow_rules(css_text):
    """selector ('.class' or bare tag name) -> its overflow-x/overflow value,
    read from a page's own <style> block. Handles only the flat `sel{...}`
    shape this site's templates actually use -- not a general CSS parser."""
    rules = {}
    for m in re.finditer(r"([.\w][.\w\-, ]*)\{([^}]*)\}", css_text):
        selectors, body = m.group(1), m.group(2)
        ox = re.search(r"overflow-x\s*:\s*([a-z]+)", body)
        o = re.search(r"(?<!-)overflow\s*:\s*([a-z]+)", body)
        val = ox.group(1) if ox else (o.group(1) if o else None)
        if not val:
            continue
        for sel in selectors.split(","):
            rules[sel.strip()] = val
    return rules


class AncestorTracker(HTMLParser):
    """For every RISKY_TAGS element encountered, records its full ancestor
    chain (outermost first) as [(tag, [classes]), ...]."""

    def __init__(self):
        super().__init__()
        self.stack = []
        self.findings = []

    def handle_starttag(self, tag, attrs):
        classes = dict(attrs).get("class", "").split()
        self.stack.append((tag, classes))
        if tag in RISKY_TAGS:
            self.findings.append(list(self.stack))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.stack.pop()

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break


def overflow_for(tag, classes, rules):
    for c in classes:
        if f".{c}" in rules:
            return rules[f".{c}"]
    return rules.get(tag)


def find_violations(html_text, label):
    css = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", html_text, re.S))
    rules = extract_overflow_rules(css)
    parser = AncestorTracker()
    parser.feed(html_text)

    violations = []
    for chain in parser.findings:
        risky_tag = chain[-1][0]
        scrollable = False
        clipped_by = None
        # walk from the element itself outward to the document root
        for tag, classes in reversed(chain):
            ov = overflow_for(tag, classes, rules)
            if ov in ("auto", "scroll"):
                scrollable = True
                break
            if ov == "hidden":
                clipped_by = f"{tag}.{'.'.join(classes)}" if classes else tag
                break
        # only a violation if something actually clips it -- an element with
        # no scrollable wrapper AND no overflow:hidden ancestor either isn't
        # clipped at all (it may cause page-level scroll, which is a
        # different, separately-owned invariant, not this check's job).
        if not scrollable and clipped_by:
            violations.append(
                f"{label}: <{risky_tag}> has no horizontal-scroll ancestor "
                f"(clipped by ancestor {clipped_by}, overflow:hidden)"
            )
    return violations


def check_files(paths):
    violations = []
    for path in paths:
        with open(path, encoding="utf-8") as f:
            violations += find_violations(f.read(), path)
    return violations


SELFTEST_CASES = [
    (
        "honest_table_wrap",
        '<style>.window{overflow:hidden}.table-wrap{overflow-x:auto}</style>'
        '<div class="window"><div class="table-wrap"><table><tr><td>x</td></tr></table></div></div>',
        0,
    ),
    (
        "poisoned_bare_table_under_hidden_window",
        '<style>.window{overflow:hidden}</style>'
        '<div class="window"><table><tr><td>x</td></tr></table></div>',
        1,
    ),
    (
        "bare_table_no_hidden_ancestor_at_all",
        '<style>.window{overflow:visible}</style>'
        '<div class="window"><table><tr><td>x</td></tr></table></div>',
        0,
    ),
    (
        "pre_scrollable_on_the_tag_itself",
        '<style>pre{overflow-x:auto}.window{overflow:hidden}</style>'
        '<div class="window"><pre>long unbreakable line</pre></div>',
        0,
    ),
    (
        "pre_bare_under_hidden_window",
        '<style>.window{overflow:hidden}</style>'
        '<div class="window"><pre>long unbreakable line</pre></div>',
        1,
    ),
    (
        "two_risky_elements_one_bad_one_good",
        '<style>.window{overflow:hidden}.table-wrap{overflow-x:auto}</style>'
        '<div class="window">'
        '<div class="table-wrap"><table><tr><td>ok</td></tr></table></div>'
        '<pre>not wrapped</pre>'
        '</div>',
        1,
    ),
]


def selftest():
    ok = True
    for name, html, expected in SELFTEST_CASES:
        got = len(find_violations(html, "<selftest>"))
        passed = got == expected
        ok = ok and passed
        print(f"[{'PASS' if passed else 'FAIL'}] {name}: expected {expected}, got {got}")
    return ok


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(0 if selftest() else 1)

    paths = sorted(glob.glob("static/*.html"))
    if not paths:
        print("check-no-clipped-overflow: no static/*.html found (wrong cwd?)")
        sys.exit(1)

    violations = check_files(paths)
    if violations:
        print("check-no-clipped-overflow: FAILED")
        for v in violations:
            print(f"  {v}")
        sys.exit(1)

    print(f"check-no-clipped-overflow: OK -- 0 unwrapped <table>/<pre> across {len(paths)} static pages")
