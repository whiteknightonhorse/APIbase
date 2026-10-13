#!/usr/bin/env python3
"""T-0384a: phone-width gate for the static pages (design M).

Static mode (always runs) asserts rules in static/assets/site-m.css:
  - every flex row whose selector is inside .hm-hero / .hm-cta has flex-wrap:wrap;
  - no declaration sets a fixed width above 340px without max-width:100% in the same rule;
  - long code / URL rules (code, .hm-ep-url code) set overflow-wrap.
Browser mode runs additionally when playwright and a Chromium binary are available (set
CHROMIUM_PATH to override): every static/*.html page is loaded with mobile emulation at 360 and
390px from a local file server and must not scroll horizontally. Pass --no-browser to skip it.
Prints which mode ran. Exit 1 on any violation."""
import functools
import glob
import http.server
import os
import re
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = os.path.join(ROOT, 'static')
CSS = os.path.join(STATIC, 'assets/site-m.css')
errs = []


def rules(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    for m in re.finditer(r'([^{}@]+)\{([^{}]*)\}', css):
        yield m.group(1).strip(), m.group(2)


def static_mode():
    css = open(CSS, encoding='utf-8').read()
    code_wrap = False
    for sel, body in rules(css):
        decl = {k.strip(): v.strip() for k, _, v in (d.partition(':') for d in body.split(';')) if k.strip()}
        if re.search(r'\.hm-(hero|cta)\b(?!-)', sel):
            if (decl.get('display') == 'flex' and not decl.get('flex-direction', '').startswith('column')
                    and decl.get('flex-wrap') != 'wrap'):
                errs.append(f'flex row without flex-wrap:wrap: {sel}')
        w = re.match(r'(\d+)px', decl.get('width', ''))
        if w and int(w.group(1)) > 340 and decl.get('max-width') != '100%':
            errs.append(f'fixed width {w.group(0)} without max-width:100%: {sel}')
        if re.search(r'\.hm-ep-url code', sel) and 'overflow-wrap' in decl:
            code_wrap = True
    if not code_wrap:
        errs.append('no .hm-ep-url code rule sets overflow-wrap')
    if not re.search(r'(^|\n)code,kbd,samp\{[^}]*overflow-wrap:anywhere', css):
        errs.append('base code rule lacks overflow-wrap:anywhere')


def browser_mode():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return False
    exe = os.environ.get('CHROMIUM_PATH') or next(iter(sorted(glob.glob(
        os.path.expanduser('~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome')))), None)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):
            pass

    handler = functools.partial(Quiet, directory=STATIC)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            try:
                b = p.chromium.launch(executable_path=exe, args=['--no-sandbox']) if exe else p.chromium.launch()
            except Exception:
                return False
            pages = sorted(os.path.relpath(f, STATIC) for f in glob.glob(os.path.join(STATIC, '*.html')))
            for w in (360, 390):
                ctx = b.new_context(viewport={'width': w, 'height': 800}, is_mobile=True, has_touch=True)
                for rel in pages:
                    pg = ctx.new_page()
                    pg.goto(f'http://127.0.0.1:{srv.server_port}/{rel}')
                    sw = pg.evaluate('document.documentElement.scrollWidth')
                    if sw > w:
                        errs.append(f'{rel} at {w}px scrolls horizontally (scrollWidth {sw})')
                    pg.close()
            b.close()
    finally:
        srv.shutdown()
    return True


static_mode()
mode = 'static'
if '--no-browser' not in sys.argv and browser_mode():
    mode = 'static+browser'
print(f'check-mobile-width: mode={mode}')
for e in errs:
    print('FAIL', e)
print('FAIL' if errs else 'OK')
sys.exit(1 if errs else 0)
