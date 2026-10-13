#!/usr/bin/env python3
"""T-0367: one site header. config/site-nav.html and config/site-nav.css are the single source; every
static page carries them between <!--site-nav--> ... <!--/site-nav--> and /*site-nav*/ ... /*/site-nav*/.
  check [--no-fetch]  verify static/**/*.html (and $SITE_NAV_PATHS fetched from $SITE_NAV_BASE)
  apply               rewrite the text between the marker pairs of every static page that has them
Run as: python3 -I scripts/site-nav.py <check|apply>. ROOT defaults to the repo this script lives in."""
import glob, os, re, subprocess, sys, time

ROOT = os.environ.get("ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get("SITE_NAV_BASE", "http://127.0.0.1:8880")
PATHS = os.environ.get("SITE_NAV_PATHS", "").split()

H_OPEN, H_CLOSE = "<!--site-nav-->", "<!--/site-nav-->"
C_OPEN, C_CLOSE = "/*site-nav*/", "/*/site-nav*/"


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


FRAG = read(os.path.join(ROOT, "config/site-nav.html")).strip()
CSS = read(os.path.join(ROOT, "config/site-nav.css")).strip()


def pages():
    for f in sorted(glob.glob(os.path.join(ROOT, "static/**/*.html"), recursive=True)):
        if os.path.basename(f).startswith("_") or "/video/templates/" in f or os.path.dirname(f).endswith("static/integrator"):
            continue
        yield f


def blocks(s, a, b):
    return list(re.finditer(re.escape(a) + r"(.*?)" + re.escape(b), s, re.S))


def check_page(label, s):
    fails = []
    hb = blocks(s, H_OPEN, H_CLOSE)
    if len(hb) != 1 or s.count(H_OPEN) != 1 or s.count(H_CLOSE) != 1:
        fails.append("no markers")
    else:
        if hb[0].group(1).strip() != FRAG:
            fails.append("site nav differs")
        first = s.find("<nav")
        if first == -1 or first < hb[0].start() or first > hb[0].end():
            fails.append("nav before site nav")
    cb = blocks(s, C_OPEN, C_CLOSE)
    if len(cb) != 1 or s.count(C_OPEN) != 1 or s.count(C_CLOSE) != 1:
        fails.append("site nav css missing")
    elif cb[0].group(1).strip() != CSS:
        fails.append("site nav css differs")
    vp = [m.group(0) for m in re.finditer(r"<meta\b[^>]*>", s) if re.search(r'\bname="viewport"', m.group(0))]
    if not any("width=device-width" in t for t in vp):
        fails.append("no viewport")
    return ["SITE_NAV_FAIL %s: %s" % (label, w) for w in fails]


def check(no_fetch):
    out, n = [], 0
    for f in pages():
        n += 1
        out += check_page(os.path.relpath(f, ROOT), read(f))
    if not no_fetch:
        for p in PATHS:
            n += 1
            code, body = "", ""
            # A deploy restarts the upstream while CI runs this gate: wait for it before failing.
            for _ in range(int(os.environ.get("SITE_NAV_RETRIES", "12"))):
                r = subprocess.run(["curl", "-s", "-m", "15", "-H", "Host: apibase.pro", "-w", "\n%{http_code}", BASE + p],
                                   capture_output=True, text=True)
                body, _, code = r.stdout.rpartition("\n")
                if code.isdigit() and int(code) < 500 and code != "000":
                    break
                time.sleep(int(os.environ.get("SITE_NAV_RETRY_SLEEP", "10")))
            if code != "200":
                out.append("SITE_NAV_FAIL %s: HTTP %s" % (p, code or "no response"))
            else:
                out += check_page(p, body)
    for line in out:
        print(line)
    print("site-nav: pages checked = %d, failures = %d" % (n, len(out)))
    return 1 if out else 0


def apply():
    for f in pages():
        s = read(f)
        if len(blocks(s, H_OPEN, H_CLOSE)) != 1 or len(blocks(s, C_OPEN, C_CLOSE)) != 1:
            print("SITE_NAV_FAIL %s: no markers" % os.path.relpath(f, ROOT))
            continue
        t = re.sub(re.escape(H_OPEN) + r".*?" + re.escape(H_CLOSE), lambda m: H_OPEN + "\n" + FRAG + "\n" + H_CLOSE, s, count=1, flags=re.S)
        t = re.sub(re.escape(C_OPEN) + r".*?" + re.escape(C_CLOSE), lambda m: C_OPEN + "\n" + CSS + "\n" + C_CLOSE, t, count=1, flags=re.S)
        if t != s:
            with open(f, "w", encoding="utf-8") as fh:
                fh.write(t)
            print("changed %s" % os.path.relpath(f, ROOT))
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "check":
        sys.exit(check("--no-fetch" in sys.argv[2:]))
    if cmd == "apply":
        sys.exit(apply())
    print("usage: site-nav.py check [--no-fetch] | apply", file=sys.stderr)
    sys.exit(2)
