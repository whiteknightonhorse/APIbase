#!/usr/bin/env python3
"""
check-english-only-static.py -- T-00 (dashboard-english-only, 2026-09-04).

The operator found ~85 Russian text fragments live on https://apibase.pro/dashboard
(and its sibling /autopilot/incident page): headings ("Needs you" / "Fixes itself" in Russian), empty-state copy ("Loading"
in Russian), legends ("Legend:" in Russian), and -- worst of all, because they
only show up when something is already broken -- ERROR TEXTS ("failed to load
incidents -- state unknown" in Russian). Root cause:
the AP-10 mockup's open question about locale was read as "match the J2/J3
service-template precedent (Russian)" instead of "no decision made yet";
that reading was wrong. Ruling (2026-09-04): dashboard UI is English-only,
full stop.

`static/dashboard.html` and `static/autopilot-incident.html` have no build
step and no template layer (nginx `try_files` serves them byte-for-byte --
see nginx/nginx.conf `location = /dashboard` / `location = /autopilot/incident`)
so whatever Cyrillic sits in the committed file is EXACTLY what a visitor's
browser receives, including text buried inside HTML comments and inline
<script> comments (those bytes go out over the wire same as any other text
node -- a comment is not stripped before nginx serves the file). This check
scans the full raw file text for that reason, not just parsed visible text.

This is a STATIC check on the committed files -- it does not curl the live
site (this sandbox has no route to the production host). The operator's own
live-site curl is the final acceptance gate; this script is what stops the
next commit from ever reintroducing what that curl would catch:

    curl -s https://apibase.pro/dashboard | grep -c -P '[\\x{0400}-\\x{04FF}]'   -> must be 0

Scope is deliberately narrow to the autopilot dashboard family, NOT all of
static/*.html -- the public marketing pages (index.html, pricing.html, etc.)
are already English and out of scope for this task; a repo-wide Cyrillic ban
is a different, bigger decision this task was not asked to make. If a future
task widens the ban repo-wide, change TARGET_FILES below, not the detection
logic.

Run: python3 scripts/check-english-only-static.py            (checks the dashboard family)
     python3 scripts/check-english-only-static.py --selftest  (unit tests, no disk I/O)
     python3 scripts/check-english-only-static.py <path> ...  (checks exactly these files
                                                                instead of TARGET_FILES --
                                                                e.g. a generator's --print
                                                                output piped to a tempfile)
"""
import re
import sys

TARGET_FILES = [
    "static/dashboard.html",
    "static/autopilot-incident.html",
]

CYRILLIC_RE = re.compile(r"[\u0410-\u044f\u0401\u0451]")


def find_violations(text, label):
    violations = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        hits = CYRILLIC_RE.findall(line)
        if hits:
            snippet = line.strip()
            if len(snippet) > 100:
                snippet = snippet[:100] + "…"
            violations.append(f"{label}:{lineno}: {len(hits)} Cyrillic char(s) -- {snippet}")
    return violations


def check_files(paths):
    violations = []
    for path in paths:
        with open(path, encoding="utf-8") as f:
            violations += find_violations(f.read(), path)
    return violations


SELFTEST_CASES = [
    ("clean_english", "<h2>Needs you</h2><div>Loading…</div>", 0),
    ("cyrillic_heading", "<h2>\u0422\u0440\u0435\u0431\u0443\u0435\u0442 \u0432\u0430\u0441</h2>", 1),
    (
        # the exact bug class that motivated this check: Cyrillic that ONLY
        # renders when something has already failed, easy to miss by eyeballing
        # a happy-path screenshot.
        "cyrillic_error_text_only",
        "el.innerHTML = 'autopilot: <span class=\"noinfo\">\u043d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c</span>';",
        1,
    ),
    (
        # HTML comments are sent to the browser verbatim by a byte-for-byte
        # static server (no template layer strips them) -- must still count.
        "cyrillic_inside_html_comment",
        "<!-- \u0441\u0442\u0438\u043b\u044c — \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0439 \u0442\u0435\u0440\u043c\u0438\u043d\u0430\u043b\u044c\u043d\u044b\u0439 HUD -->\n<h1>Dashboard</h1>",
        1,
    ),
    (
        # JS comments inside <script> ship over the wire too, same reasoning.
        "cyrillic_inside_js_comment",
        "<script>\n// \u041b\u0435\u0433\u0435\u043d\u0434\u0430: state colors\nfunction f(){}\n</script>",
        1,
    ),
    ("multiple_hits_one_line", "\u041b\u0435\u0433\u0435\u043d\u0434\u0430: \u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0427\u0438\u043d\u0438\u0442\u0441\u044f", 1),  # one violation entry per LINE
    ("english_word_containing_no_cyrillic", "Provider status dashboard", 0),
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

    explicit = [a for a in sys.argv[1:] if not a.startswith("--")]
    paths = explicit if explicit else TARGET_FILES

    violations = check_files(paths)
    if violations:
        print("check-english-only-static: FAILED -- Cyrillic found in dashboard-family static HTML")
        for v in violations:
            print(f"  {v}")
        sys.exit(1)

    print(f"check-english-only-static: OK -- 0 Cyrillic characters across {len(paths)} file(s)")
