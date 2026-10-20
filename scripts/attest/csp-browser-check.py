"""T-0510z: load /attest/ in Chromium with the CSP taken from nginx/apibase-host.conf (CSP on, no bypass).
Usage: python3 csp-browser-check.py <receipt_id> <screenshot.png> [base_url]
With base_url (e.g. https://apibase.pro) the live site is checked as served.
Without it, static/ is served locally over TLS under the apibase.pro hostname (self-signed cert in
$TLS_DIR/c.pem + $TLS_DIR/k.pem, mapped in the browser) with the /attest/ CSP, and /r/<id>.json is
proxied from production. The page fetches the absolute https://apibase.pro/r/..., so 'self' only
holds if the origin really is https://apibase.pro.
CHROMIUM_PATH selects the browser binary (default: Playwright's own)."""
import http.server, os, re, ssl, sys, threading, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

rid, shot = sys.argv[1], sys.argv[2]
base = sys.argv[3] if len(sys.argv) > 3 else None
root = Path(__file__).resolve().parents[2]
rules = None

if base is None:
    conf = (root / "nginx/apibase-host.conf").read_text()
    block = conf[conf.index("location ^~ /attest/ {"):]
    csp = re.search(r'Content-Security-Policy "([^"]+)"', block).group(1)

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            path = self.path.split("?")[0]
            if path.startswith("/r/"):
                body = urllib.request.urlopen("https://apibase.pro" + path, timeout=15).read()
                ctype = "application/json"
            else:
                rel = "attest/index.html" if path == "/attest/" else path.lstrip("/")
                f = root / "static" / rel
                if not f.is_file():
                    self.send_error(404)
                    return
                body = f.read_bytes()
                ctype = {".html": "text/html", ".js": "application/javascript", ".css": "text/css"}.get(f.suffix, "application/octet-stream")
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Security-Policy", csp)
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(os.environ["TLS_DIR"] + "/c.pem", os.environ["TLS_DIR"] + "/k.pem")
    srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = "https://apibase.pro"
    rules = f"MAP apibase.pro 127.0.0.1:{srv.server_port}"

with sync_playwright() as p:
    args = ["--no-sandbox"] + ([f"--host-resolver-rules={rules}"] if rules else [])
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"), args=args)
    page = b.new_context(ignore_https_errors=bool(rules)).new_page()
    msgs, reqs = [], []
    page.on("console", lambda m: msgs.append(f"{m.type}: {m.text}"))
    page.on("pageerror", lambda e: msgs.append(f"pageerror: {e}"))
    page.on("request", lambda r: reqs.append(r.url))
    resp = page.goto(f"{base}/attest/?r={rid}", wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(8000)
    print("CSP header:", resp.headers.get("content-security-policy"))
    print("BODY TEXT:\n", page.inner_text("main") if page.query_selector("main") else page.inner_text("body")[:2500])
    print("button disabled flags:", [x.is_disabled() for x in page.query_selector_all("button")])
    page.screenshot(path=shot, full_page=True)
    print("console:", *msgs, sep="\n  ")
    print("external origins:", sorted({u.split("/")[2] for u in reqs if not u.startswith(base)}))
    viol = [m for m in msgs if "Content Security Policy" in m or "Refused to" in m]
    print("CSP VIOLATIONS:", len(viol))
    b.close()
    sys.exit(1 if viol else 0)
