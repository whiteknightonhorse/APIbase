#!/usr/bin/env python3
"""pricing-recheck.py — monthly check that the numbers provider-limits.json
depends on are still stated on the provider's public page.

T-0243 redesign (PRICING-RECHECK-FLOOD-1001 ruling-1). T-0160 hashed the whole
visible text of `docs_url` and escalated on any change: 73 false incidents on
2026-10-01, because a docs page drifts month to month by design and 45 of the
73 providers have no number in config to compare at all. This version compares
CONFIG NUMBERS, not page text:

  * expected tokens per provider come from config only: `free_limit` (when > 0,
    and not just the cents form of a `$` amount in limit_proof), every `$`
    amount in `limit_proof`, plus optional `pricing_tokens`;
  * number matching is value-based: 10000 == 10,000 == "10 000" == 10k;
  * no tokens -> `not_priced:<url>`, no fetch; `pricing_check: "manual"` ->
    `manual:<url>`, no fetch; optional `pricing_url` wins over `docs_url`;
  * every distinct URL is fetched once per run (retry up to 3x on failure only);
  * all tokens present            -> verified (`<url>`), tokens + sha + normalized
    text stored under {TASKLOOP_ROOT}/state/pricing-recheck/<provider>.{json,txt};
  * token missing, prior state    -> `changed:<url>`, UNKNOWN incident whose
    evidence lists missing/present tokens, config values and a 120-char snippet
    from last month's stored text where each missing token used to stand;
  * token missing, no prior state -> `unverifiable:<url>`, no incident;
  * fetch failure                 -> `fetch_failed:<status>:<url>`, state untouched;
  * flood guard: more than MAX_ESCALATIONS_PER_RUN changed -> zero per-provider
    incidents and ONE incident for provider `pricing-recheck`.

Boundary (FT-7 / never-sell-below-cost): read-only against every provider and
tool, no price or price_floor_usd write, no model call. The old hash file
(state/pricing-recheck-hashes.json) is ignored.

Modes: `--dry-run` = full fetch + report, no DB write / incident / state write;
`--selftest` = fixtures only, no network, no DB. Report:
logs/pricing-recheck-<date>.md. Scheduled monthly (day 1, 05:00) against
apibase-postgres-1 (autopilot_common's PG_CONTAINER).
"""
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "autopilot"))
import autopilot_common as ap  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROVIDER_LIMITS_PATH = os.path.join(REPO_ROOT, "src/config/provider-limits.json")
STATE_DIR = os.environ.get("PRICING_RECHECK_STATE_DIR", f"{ap.TASKLOOP_ROOT}/state/pricing-recheck")
LOG_DIR = os.environ.get("PRICING_RECHECK_LOG_DIR", os.path.join(REPO_ROOT, "logs"))
FETCH_TIMEOUT_S = 15
FETCH_CONCURRENCY = 20
FETCH_ATTEMPTS = 3
MAX_ESCALATIONS_PER_RUN = 8
SNIPPET_CHARS = 120
NO_SOURCE = "no_docs_url_configured"
CLASSES = ("verified", "changed", "unverifiable", "fetch_failed", "not_priced", "manual")


def load_provider_config():
    with open(PROVIDER_LIMITS_PATH) as f:
        return json.load(f)


_SCRIPT_OR_STYLE_RE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
# Atlassian Confluence's shared header/footer template (seen live on
# wikis.ec.europa.eu, i.e. eurostat's docs_url) renders a live "<version> |
# <N> ms" server-render-time badge inside <span class="server-information">
# as literal VISIBLE TEXT, not markup — unlike the Cloudflare nonce/RUM noise
# below, generic tag-stripping does NOT remove it, because the digit itself
# is "content" to a naive stripper. Confirmed via 4 back-to-back live fetches
# of eurostat's docs_url: only this span's digits differed (1ms vs 2ms),
# which would have re-triggered fetch_hash_voted's 2-of-3 vote on every
# monthly run indefinitely (attempt-3 fresh 30-provider sample, ruling-1
# follow-up: this was the one unstable result of 30). The span's own inner
# markup is a FIXED, non-nested set of sub-spans (verified against the live
# page), so a bounded "self-contained inner span OR non-tag char" repetition
# safely matches the true balanced close instead of stopping at the first
# nested </span>.
_SERVER_INFO_RE = re.compile(
    r'<span\s+class="server-information"[^>]*>(?:<span[^>]*>[^<]*</span>|[^<])*</span>',
    re.IGNORECASE,
)
_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")
# A third noise class, distinct from both above: a live wall-clock timestamp
# printed as VISIBLE TEXT that ticks every second (marinespecies.org/worms'
# rendered "HH:MM:SS+02:00" server time; hunter.io's embedded API-example
# JSON carrying a live "made_at": "<ISO-8601>Z" that regenerates per request)
# — confirmed live (ruling-3): fetch_hash_voted's three sequential fetches of
# either page land inside the SAME second often enough that all three hash
# equal by accident, so the 2-of-3 vote (meant to catch per-request noise)
# passes on pure luck; the very next run, a second later, hashes differently
# and would escalate as a false "pricing changed" WAITING_HUMAN every month.
# Stripped separately from generic tag/markup noise because this lives in the
# page's own text, not in tags — the same reason _SERVER_INFO_RE couldn't be
# handled by _TAG_RE either. Applied to both bare "HH:MM:SS+HH:MM" (worms)
# and "YYYY-MM-DDTHH:MM:SS" (hunter) forms; a residual trailing "Z" or
# "+HH:MM" is left in the T-prefixed case, but that suffix is constant across
# fetches (a fixed UTC marker or timezone offset), so it never itself moves
# the hash — only the digits that actually tick have to go.
_TIME_OFFSET_RE = re.compile(r"\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}")
_ISO_DATETIME_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


def normalize_body(body: bytes) -> str:
    """Reduce a fetched HTML page to its visible text so the hash tracks
    pricing content, not per-request noise. Real pages served through
    Cloudflare carry a fresh nonce/RUM token on EVERY request — CF email
    obfuscation (`/cdn-cgi/l/email-protection#<hex>`), `data-cf-beacon`,
    signed asset URLs — all of which live in tag attributes or <script>
    bodies, never in the text a human actually reads. Stripping scripts,
    styles, comments, and all tags (attributes included) before hashing
    means only an actual content change moves the hash; a raw-body hash
    was ~23% false-positive per FT-7 attempt-1 review (ruling-1). A second,
    narrower noise source lives in visible text itself — see _SERVER_INFO_RE
    above — and is stripped separately before the generic tag strip."""
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        text = body.decode("latin-1", errors="replace")
    text = _SCRIPT_OR_STYLE_RE.sub(" ", text)
    text = _COMMENT_RE.sub(" ", text)
    text = _SERVER_INFO_RE.sub(" ", text)
    text = _TAG_RE.sub(" ", text)
    text = _TIME_OFFSET_RE.sub(" ", text)
    text = _ISO_DATETIME_RE.sub(" ", text)
    return _WHITESPACE_RE.sub(" ", text).strip()


class _Opener308(urllib.request.HTTPRedirectHandler):
    """stdlib's HTTPRedirectHandler follows 301/302/303/307 but not 308
    (Permanent Redirect) — RFC 7538 postdates the handler's last update.
    308 behaves identically to 307 (method+body preserved). Aliasing
    http_error_308 alone is NOT enough: http_error_307 defers to
    redirect_request(), which has its own hardcoded `code in (301, 302,
    303, 307)` allow-list that 308 fails regardless of which http_error_*
    method dispatched into it (verified by inspecting the stdlib source —
    a first attempt at this fix aliased only http_error_308 and still
    raised HTTPError 308 on a live redirect). Remapping 308 -> 307 before
    deferring to the parent implementation is the actual fix; only GET/HEAD
    are remapped since that's this script's only method and 307/308 both
    forbid resending a POST body without confirmation anyway."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if code == 308 and req.get_method() in ("GET", "HEAD"):
            code = 307
        return super().redirect_request(req, fp, code, msg, headers, newurl)

    http_error_308 = urllib.request.HTTPRedirectHandler.http_error_307


_OPENER = urllib.request.build_opener(_Opener308)




def fetch_text(url):
    """(normalized_text, None) on success, (None, status) on failure, where
    status is the HTTP code or 'error'. Never raises."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "APIbase-pricing-recheck/1.0"})
        with _OPENER.open(req, timeout=FETCH_TIMEOUT_S) as resp:
            body = resp.read()
    except urllib.error.HTTPError as e:
        return None, str(e.code)
    except (urllib.error.URLError, OSError, ValueError):
        return None, "error"
    return normalize_body(body), None


def fetch_with_retry(url):
    status = "error"
    for _ in range(FETCH_ATTEMPTS):
        text, status = fetch_text(url)
        if text is not None:
            return text, None
    return None, status


# ---- number tokens ---------------------------------------------------------

_GROUPED_RE = re.compile(r"\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?(?!\d)")
_PLAIN_RE = re.compile(r"\d+(?:\.\d+)?")
_SUFFIX_MULT = {"k": 1000, "m": 1000000}
_WORD_MULT_RE = re.compile(r"\s?(thousand|million)\b", re.IGNORECASE)
_WORD_MULT = {"thousand": 1000, "million": 1000000}
_CURRENCY_RE = re.compile(r"\$\s?(\d[\d,]*(?:\.\d+)?)")


def _canon(d):
    return format(d.normalize(), "f")


def _num_matches(text):
    """Yield (start, end, canonical value) for every number in text: plain
    digits and grouped digits ("10,000" / "10 000"), each also with a k/m
    suffix. Plain pieces of a grouped number are yielded as well."""
    for rx in (_GROUPED_RE, _PLAIN_RE):
        for m in rx.finditer(text):
            try:
                val = Decimal(re.sub(r"[,\s]", "", m.group(0)))
            except InvalidOperation:
                continue
            yield m.start(), m.end(), _canon(val)
            word = _WORD_MULT_RE.match(text, m.end())
            if word:
                yield m.start(), word.end(), _canon(val * _WORD_MULT[word.group(1).lower()])
            suffix = text[m.end():m.end() + 1].lower()
            if suffix in _SUFFIX_MULT and not text[m.end() + 1:m.end() + 2].isalnum():
                yield m.start(), m.end() + 1, _canon(val * _SUFFIX_MULT[suffix])


def page_numbers(text):
    return {v for _, _, v in _num_matches(text)}


def token_value(tok):
    try:
        return _canon(Decimal(str(tok).replace(",", "").lstrip("$").strip()))
    except InvalidOperation:
        return None


def currency_amounts(proof):
    out = []
    for m in _CURRENCY_RE.finditer(proof or ""):
        v = token_value(m.group(1))
        if v is not None and v != "0" and v not in out:  # "$0" is not a number to verify
            out.append(v)
    return out


def expected_tokens(cfg):
    """Canonical number strings the config depends on, in stable order."""
    amounts = currency_amounts(cfg.get("limit_proof"))
    toks = []
    fl = cfg.get("free_limit") or 0
    if isinstance(fl, (int, float)) and fl > 0:
        v = _canon(Decimal(str(fl)))
        # credits stored in cents (twilio 1550 == $15.50): the page states the
        # dollar amount, which is already a token via limit_proof
        if not any(_canon(Decimal(a) * 100) == v for a in amounts):
            toks.append(v)
    toks.extend(amounts)
    for t in cfg.get("pricing_tokens") or []:
        v = token_value(t)
        if v is not None:
            toks.append(v)
    return list(dict.fromkeys(toks))


def snippet_for(old_text, token):
    for s, _e, v in _num_matches(old_text or ""):
        if v == token:
            a = max(0, s - SNIPPET_CHARS // 2)
            return old_text[a:a + SNIPPET_CHARS]
    return None


# ---- state -----------------------------------------------------------------

def load_state(provider, state_dir):
    try:
        with open(os.path.join(state_dir, f"{provider}.json")) as f:
            st = json.load(f)
        with open(os.path.join(state_dir, f"{provider}.txt")) as f:
            st["text"] = f.read()
        return st
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def save_state(provider, state_dir, tokens, text):
    os.makedirs(state_dir, exist_ok=True)
    meta = {"tokens": tokens, "sha256": hashlib.sha256(text.encode()).hexdigest(),
            "checked_at": ap.now_iso()}
    for name, content in ((f"{provider}.txt", text), (f"{provider}.json", json.dumps(meta, indent=2))):
        path = os.path.join(state_dir, name)
        with open(path + ".tmp", "w") as f:
            f.write(content)
        os.replace(path + ".tmp", path)


# ---- classification --------------------------------------------------------

def target_url(cfg):
    return cfg.get("pricing_url") or cfg.get("docs_url")


def pre_class(cfg):
    """Class decidable without a fetch, else None."""
    url = target_url(cfg)
    if cfg.get("pricing_check") == "manual":
        return {"cls": "manual", "source": f"manual:{url}", "url": url}
    if not expected_tokens(cfg):
        return {"cls": "not_priced", "source": f"not_priced:{url or 'none'}", "url": url}
    if not url:
        return {"cls": "fetch_failed", "source": NO_SOURCE, "url": None, "status": "no_url"}
    return None


def classify(provider, cfg, fetched, state_dir):
    """fetched: {url: (text, status)}. Pure apart from reading prior state."""
    pre = pre_class(cfg)
    if pre:
        return pre
    url = target_url(cfg)
    tokens = expected_tokens(cfg)
    text, status = fetched.get(url, (None, "error"))
    if text is None:
        return {"cls": "fetch_failed", "source": f"fetch_failed:{status}:{url}", "url": url, "status": status}
    have = page_numbers(text)
    present = [t for t in tokens if t in have]
    missing = [t for t in tokens if t not in have]
    res = {"url": url, "tokens": tokens, "present": present, "missing": missing, "text": text}
    if not missing:
        res.update(cls="verified", source=url)
        return res
    prior = load_state(provider, state_dir)
    if prior is None:
        res.update(cls="unverifiable", source=f"unverifiable:{url}")
        return res
    res.update(cls="changed", source=f"changed:{url}",
               snippets={t: snippet_for(prior.get("text"), t) for t in missing},
               config={"free_limit": cfg.get("free_limit"), "limit_proof": cfg.get("limit_proof"),
                       "pricing_tokens": cfg.get("pricing_tokens")})
    return res


def run_checks(providers, config, state_dir, fetch=None):
    """Fetch each distinct needed URL once, classify every provider."""
    fetch = fetch or fetch_with_retry
    urls = sorted({target_url(config.get(p) or {}) for p in providers
                   if pre_class(config.get(p) or {}) is None})
    with ThreadPoolExecutor(max_workers=FETCH_CONCURRENCY) as pool:
        fetched = dict(zip(urls, pool.map(fetch, urls)))
    return {p: classify(p, config.get(p) or {}, fetched, state_dir) for p in providers}


# ---- side effects ----------------------------------------------------------

def list_providers_in_status():
    out, rc = ap.psql("SELECT provider FROM provider_status ORDER BY provider")
    if rc != 0:
        raise RuntimeError(f"pricing-recheck: could not list provider_status rows: {out}")
    return [line for line in out.splitlines() if line]


def update_pricing_checked(provider, source):
    out, rc = ap.psql(
        f"UPDATE provider_status SET pricing_checked_at = now(), "
        f"pricing_source = {ap.sql_literal(source)} "
        f"WHERE provider = {ap.sql_literal(provider)} RETURNING provider"
    )
    if rc != 0 or not out:
        ap.notice(f"pricing-recheck: pricing_checked_at write failed for {provider}: {out}")
        return False
    return True


_SYSTEM_DID = ("deterministic comparison of the numbers in provider-limits.json against the page (pricing-recheck.py, "
               "FT-7, T-0243) - no model was called, price/price_floor_usd were not changed")


def _open(provider, evidence, what):
    try:
        ap.open_or_merge_incident(kind="UNKNOWN", provider=provider, detected_by="limits",
                                  actor="pricing-recheck", evidence=evidence, what=what,
                                  system_did=_SYSTEM_DID)
    except (AssertionError, RuntimeError) as e:
        ap.notice(f"pricing-recheck: failed to open incident for {provider}: {e}")


def escalate_changed(provider, res):
    ev = {"url": res["url"], "missing_tokens": res["missing"], "present_tokens": res["present"],
          "config": res["config"], "snippets_from_last_month": res["snippets"],
          "detected_at": ap.now_iso()}
    _open(provider, ev,
          f"{provider}: the page {res['url']} no longer contains numbers from the config: {', '.join(res['missing'])}. "
          f"Compare the limits/price in provider-limits.json with the live page (last month's fragments are in evidence).")


def escalate_summary(changed, report_path):
    ev = {"changed": {p: r["missing"] for p, r in changed.items()}, "report": report_path,
          "detected_at": ap.now_iso()}
    _open("pricing-recheck", ev,
          f"pricing-recheck: {len(changed)} providers lost their config numbers at the same time "
          f"(> {MAX_ESCALATIONS_PER_RUN}) - likely a check defect, not real price changes. "
          f"Full list: {report_path}")


def apply_escalations(results, report_path, one=None, summary=None):
    """Flood guard. Returns number of incidents opened."""
    one, summary = one or escalate_changed, summary or escalate_summary
    changed = {p: r for p, r in results.items() if r["cls"] == "changed"}
    if not changed:
        return 0
    if len(changed) > MAX_ESCALATIONS_PER_RUN:
        summary(changed, report_path)
        return 1
    for p, r in changed.items():
        one(p, r)
    return len(changed)


def write_report(results, path, dry_run):
    by = {c: sorted(p for p, r in results.items() if r["cls"] == c) for c in CLASSES}
    lines = [f"# pricing-recheck {datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
             + (" (dry-run)" if dry_run else ""), "",
             "Summary: " + ", ".join(f"{c}={len(by[c])}" for c in CLASSES), ""]
    for c in CLASSES:
        lines.append(f"## {c} ({len(by[c])})")
        if c == "fetch_failed":
            groups = {}
            for p in by[c]:
                groups.setdefault(str(results[p].get("status")), []).append(p)
            for st in sorted(groups):
                lines.append(f"### status {st}")
                lines += [f"- {p} {results[p]['url']}" for p in groups[st]]
        else:
            for p in by[c]:
                r = results[p]
                extra = ""
                if c in ("verified", "unverifiable", "changed"):
                    extra = f" tokens={r['tokens']} present={r['present']} missing={r['missing']}"
                if c == "unverifiable":
                    extra += " reason=config numbers absent from page, no baseline to compare"
                if c == "changed":
                    extra += f" snippets={json.dumps(r['snippets'], ensure_ascii=False)}"
                lines.append(f"- {p} {r['url']}{extra}")
        lines.append("")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write("\n".join(lines))
    return by


def summary_line(results, total):
    n = {c: sum(1 for r in results.values() if r["cls"] == c) for c in CLASSES}
    return f"pricing-recheck: {len(results)}/{total} providers " + ", ".join(f"{c}={n[c]}" for c in CLASSES)


def main(argv):
    dry_run = "--dry-run" in argv
    config = load_provider_config()
    providers = list_providers_in_status()
    results = run_checks(providers, config, STATE_DIR)
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    report_path = os.path.join(LOG_DIR, f"pricing-recheck-{date}.md")
    write_report(results, report_path, dry_run)
    escalated = 0
    if not dry_run:
        for p, r in results.items():
            update_pricing_checked(p, r["source"])
            if r["cls"] == "verified":
                save_state(p, STATE_DIR, r["tokens"], r["text"])
        escalated = apply_escalations(results, report_path)
    print(summary_line(results, len(providers)) + f", escalated={escalated} report={report_path}"
          + (" [dry-run]" if dry_run else ""))


# ---- selftest --------------------------------------------------------------

def selftest():
    import tempfile
    global fetch_text
    ok = True

    def check(name, cond):
        nonlocal ok
        print(f"{'PASS' if cond else 'FAIL'} {name}")
        ok = ok and bool(cond)

    def page(body):
        return normalize_body(f"<html><body>{body}</body></html>".encode())

    def fixed(t):
        return lambda url: (t, None)

    cfg200 = {"limit_type": "monthly", "free_limit": 200, "docs_url": "https://x.test/p",
              "limit_proof": "Free plan: 200 quota units/month"}
    with tempfile.TemporaryDirectory() as sd:
        p1 = page("<h1>Pricing</h1><p>200 quota units/month</p><p>News: 2026-09-01 launch</p>")
        r = run_checks(["a"], {"a": cfg200}, sd, fetch=fixed(p1))["a"]
        check("a: 200 quota units/month verifies", r["cls"] == "verified")
        save_state("a", sd, r["tokens"], r["text"])
        p2 = page("<h1>Pricing</h1><p>200 quota units/month</p><p>News: 2026-10-01 other story</p>")
        r = run_checks(["a"], {"a": cfg200}, sd, fetch=fixed(p2))["a"]
        check("b: changed news paragraph and date still verified", r["cls"] == "verified")
        r = run_checks(["a"], {"a": cfg200}, sd, fetch=fixed(page("<p>Unlimited quota</p>")))["a"]
        check("c: number removed -> changed", r["cls"] == "changed" and r["missing"] == ["200"])
        snip = r["snippets"]["200"] or ""
        check("c: snippet from last month's text in evidence", "200 quota units" in snip and len(snip) <= SNIPPET_CHARS)
        before = load_state("a", sd)
        r = run_checks(["a"], {"a": cfg200}, sd, fetch=lambda u: (None, "403"))["a"]
        check("i: fetch failure -> fetch_failed:403, prior state intact",
              r["cls"] == "fetch_failed" and r["source"] == "fetch_failed:403:https://x.test/p"
              and load_state("a", sd) == before)

    def boom(*a, **k):
        raise AssertionError("fetch called")
    cfgu = {"limit_type": "unlimited", "free_limit": 0, "docs_url": "https://u.test", "limit_proof": "No limits"}
    orig = fetch_text
    fetch_text = boom
    try:
        with tempfile.TemporaryDirectory() as sd:
            r = run_checks(["u"], {"u": cfgu}, sd)["u"]
        check("d: unlimited/no amount -> not_priced, fetch never called",
              r["cls"] == "not_priced" and r["source"] == "not_priced:https://u.test")
    except AssertionError:
        check("d: unlimited/no amount -> not_priced, fetch never called", False)
    finally:
        fetch_text = orig
    m = pre_class({"free_limit": 5, "docs_url": "https://m.test", "pricing_check": "manual"})
    check("manual: no fetch", m["cls"] == "manual" and m["source"] == "manual:https://m.test")
    check("pricing_url wins over docs_url", target_url({"pricing_url": "P", "docs_url": "D"}) == "P")

    for form in ("10,000", "10 000", "10k", "10000"):
        check(f"e: 10000 matches {form!r}", "10000" in page_numbers(f"Plan: {form} calls"))
    check("e: 10000000 matches '10 million'", "10000000" in page_numbers("up to 10 million calls"))
    check("e: '10 kittens' is not 10k", "10000" not in page_numbers("10 kittens"))

    with tempfile.TemporaryDirectory() as sd:
        res = run_checks(["a"], {"a": cfg200}, sd, fetch=fixed(page("nothing here")))
        opened = []
        n = apply_escalations(res, "rp", one=lambda p, r: opened.append(p), summary=lambda c, rp: opened.append("S"))
    check("f: no baseline -> unverifiable, no incident", res["a"]["cls"] == "unverifiable" and not opened and n == 0)

    def flood(k):
        res = {f"p{i}": {"cls": "changed", "missing": ["1"]} for i in range(k)}
        got = []
        apply_escalations(res, "rp", one=lambda p, r: got.append(p), summary=lambda c, rp: got.append("SUMMARY"))
        return got
    g9, g8 = flood(9), flood(8)
    check("g: nine -> zero per-provider, one summary", g9 == ["SUMMARY"])
    check("g: eight -> eight per-provider, no summary", len(g8) == 8 and "SUMMARY" not in g8)

    calls = []

    def counting(u):
        calls.append(u)
        return p1, None
    with tempfile.TemporaryDirectory() as sd:
        run_checks(["a", "b"], {"a": cfg200, "b": dict(cfg200)}, sd, fetch=counting)
    check("h: shared url fetched once", calls == ["https://x.test/p"])

    got = currency_amounts("Trial: $15.50 credit. SMS: $0.0083/msg US. Lookup: $0.005/call.")
    check("j: $0.0083 $15.50 $0.005 extracted", sorted(got) == sorted(["15.5", "0.0083", "0.005"]))
    check("twilio cents-form free_limit is not a token", "1550" not in expected_tokens(
        {"free_limit": 1550, "limit_proof": "Trial: $15.50 credit. $0.0083/msg"}))
    print("SELFTEST " + ("OK" if ok else "FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    main(sys.argv[1:])
