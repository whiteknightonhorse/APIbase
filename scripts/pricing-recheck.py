#!/usr/bin/env python3
"""pricing-recheck.py — T-0160 (FT-7 of T-0155's Fleet task list, §5): monthly
deterministic diff-check of each provider's pricing/limits source, writing
provider_status.pricing_checked_at / pricing_source on EVERY run (baseline
fill, and "checked, no source configured" both count as checked — never
silently null after a real run, same posture reliability_calculated_at,
migration 0018, already takes for reliability_score) and escalating via a
WAITING_HUMAN UNKNOWN incident ONLY when the fetched page's content hash
differs from the prior successful check.

Explicitly NOT built here (⛔ FT-7 boundary, 01-law-never-sell-below-cost
ruling-1 point D): no price or price_floor_usd write, ever — this script is
read-only against every provider and every tool. No model call anywhere in
this file — "does this normalized-text hash match the last one" is the
entire judgment call (task's own rule: "код, а не модель"), same C0.1 "не
изобретай новую кассу" posture as provider-limit-alerts.py's own
reliability-score marker file. The hash is taken over `normalize_body()`'s
output (visible text only — scripts/styles/comments/tags stripped), not the
raw response bytes: a raw-byte hash was unstable across back-to-back fetches
of the SAME unchanged page for ~23% of providers (Cloudflare nonce/RUM
tokens embedded in markup on every request — attempt-1 review, ruling-1),
which would have opened false WAITING_HUMAN incidents every month.

Baseline hash state lives in a local JSON file (HASH_STATE_PATH below), not a
DB column/table — the column pair this task adds is WHEN/WHERE a check
happened, never a diffable payload, so it has nowhere to durably store
yesterday's hash without inventing an unasked-for table for that alone.
`pricing_source` (the DB column) is what a human reads; the hash file is
purely this script's own working state.

Run monthly via cron (0 5 1 * *) against apibase-postgres-1 (autopilot_common's
own default PG_CONTAINER) — NOT apibase-orchestra-postgres-1, a different
database entirely.

Two fixes from ruling-2 (live re-check of attempt-2's normalized-hash fix):

1. Redirect following. `urllib.request.HTTPRedirectHandler` follows 301/302/
   303/307 but NOT 308 (Permanent Redirect) — a stdlib gap, not a network
   failure. 10 of 77 attempt-2 `fetch_failed` providers, several paid, were
   pure 308s that `curl -L` resolves fine. `_Opener308` below overrides
   `redirect_request()` to remap a 308 to 307 before deferring to the
   stdlib implementation — see its own docstring for why aliasing just
   `http_error_308` alone does not work.

2. Vote every fetch, not just a post-baseline mismatch. attempt-2 treated a
   brand-new provider's FIRST successful fetch as ground truth outright —
   but a handful of pages (celestrak request counters, rotating "you may
   also like" widgets) carry per-request noise IN THE VISIBLE TEXT itself,
   which normalize_body cannot and should not strip (it's real page content,
   not markup). For those pages no single fetch is representative, baseline
   or otherwise, and a naive first-fetch baseline would either (a) never
   match again, escalating every month on pure noise, or worse (b) happen to
   coincidentally re-match sometimes, masking a REAL price change as "just
   more noise" forever. fetch_hash_voted below refetches every provider up
   to 3x and requires 2-of-3 agreement before treating any hash as
   trustworthy — for baseline establishment same as for a later mismatch,
   both now go through the identical vote. A page that never reaches 2-of-3
   agreement is written to `pricing_source` as `unstable:<url>`, distinct
   from a plain successful `<url>`, precisely so the DB does not claim a
   verified check happened where the page's own noise made verification
   impossible — and the run's summary line reports how many providers
   landed there, so this doesn't silently point-solve itself away in
   `WHERE pricing_source NOT LIKE 'fetch_failed:%'` reporting that a human
   might later write assuming a bare URL always means "checked clean". A
   provider that only *sometimes* lands here (e.g. it's a busy page that
   just happened to be volatile this particular month) is coded correctly:
   `unstable:` for that month, but its OLD known-hash baseline is left
   untouched (see write-phase comment) so a later stable month can still
   compare fresh against the same trusted value instead of drifting.

3. Strip per-second wall-clock noise from visible text, don't rely on the
   vote to catch it (ruling-3, live re-check of attempt-4's quorum fix).
   attempt-4's own knowledge notes wrongly generalized worms/hunter into the
   same "quorum catches it" bucket as celestrak/email_verify/rateapi above —
   but a per-REQUEST noise source (a counter, a shuffled widget) differs
   between fetches essentially always, so 2 of any 3 sequential fetches
   reliably land on the SAME accidental non-match and correctly fall to
   `unstable:`. A per-SECOND noise source (worms' rendered "HH:MM:SS+02:00"
   server time; hunter.io's embedded API-example JSON with a live
   `"made_at": "<ISO-8601>Z"`) is different in kind: three fetches issued
   back-to-back by fetch_hash_voted typically complete within the same
   wall-clock second, so all three hashes accidentally AGREE, the vote
   passes 3-of-3, and the page gets written to `pricing_source` as a plain
   verified `<url>` with a baseline hash containing that second's digits
   baked in. The very next monthly run lands on a different second, the
   hash no longer matches, and a false "pricing changed" WAITING_HUMAN opens
   — indefinitely, once a month, forever, and a REAL change on a paid
   provider like hunter.io would be indistinguishable from this noise.
   Spacing the vote's fetches apart in time would work too, but costs wall-
   clock on every run for every provider; stripping the timestamp text
   itself (_TIME_OFFSET_RE, _ISO_DATETIME_RE above) is free and handles any
   provider with this pattern, not just the two caught live so far.
"""
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "autopilot"))
import autopilot_common as ap  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROVIDER_LIMITS_PATH = os.path.join(REPO_ROOT, "src/config/provider-limits.json")
HASH_STATE_PATH = os.environ.get(
    "PRICING_RECHECK_HASH_STATE",
    f"{ap.TASKLOOP_ROOT}/state/pricing-recheck-hashes.json",
)
FETCH_TIMEOUT_S = 15
FETCH_CONCURRENCY = 20  # network-bound, independent per-provider GETs, no
# shared mutable state during the fetch phase itself (results collected into
# a plain dict below) — bounds a ~400-provider baseline run to roughly
# (providers / concurrency) * worst-case timeout instead of their sum.
NO_SOURCE = "no_docs_url_configured"
FETCH_FAILED_PREFIX = "fetch_failed:"
UNSTABLE_PREFIX = "unstable:"


def load_provider_config():
    with open(PROVIDER_LIMITS_PATH) as f:
        return json.load(f)


MAX_KNOWN_HASHES = 5  # cap per-provider history — a page that only ever
# flips between a small, stable set of backend variants (see lmpr below)
# settles here quickly; unbounded growth would itself be a signal something
# is wrong, so old entries are dropped once a provider exceeds this.


def load_hash_state():
    """Each provider maps to a LIST of known-good hashes (most-recent-last),
    not a single value — a page can legitimately alternate between a small,
    fixed set of stable renderings (e.g. lmpr/USDA's mpr.datamart.ams.usda.gov
    prints a literal "Data Mart Instance #1" vs "#2" depending which
    load-balanced backend answers — real visible text, not markup noise
    normalize_body can strip). Once both states have been independently
    confirmed once, neither ever re-triggers escalation; only a hash outside
    this known set does. Transparently upgrades a pre-existing single-string
    baseline file (attempt-1's schema) to a one-element list."""
    try:
        with open(HASH_STATE_PATH) as f:
            raw = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
    return {p: ([h] if isinstance(h, str) else h) for p, h in raw.items()}


def save_hash_state(state):
    os.makedirs(os.path.dirname(HASH_STATE_PATH), exist_ok=True)
    tmp = HASH_STATE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2, sort_keys=True)
    os.replace(tmp, HASH_STATE_PATH)


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


def fetch_hash(url):
    """sha256 hex digest of the fetched body's normalized visible text, or
    None on ANY failure (network, timeout, non-2xx, bad url) — None means
    "couldn't check this pass", never a fabricated hash that would silently
    read as "changed" on the next run that succeeds."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "APIbase-pricing-recheck/1.0"})
        with _OPENER.open(req, timeout=FETCH_TIMEOUT_S) as resp:
            body = resp.read()
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError):
        return None
    return hashlib.sha256(normalize_body(body).encode("utf-8")).hexdigest()


def fetch_hash_voted(url):
    """Fetch up to 3 times and return (hash, stable). `stable` is True only
    if some hash value was seen at least twice across the (up to) 3 fetches
    — the same 2-of-3 vote attempt-2 already used for a post-baseline
    mismatch, now run for EVERY provider on EVERY pass, baseline included
    (ruling-2: a first-ever fetch is not inherently more trustworthy than a
    later one; the page's own noise doesn't care which month it is).
    Returns (None, False) if every fetch failed."""
    counts = Counter()
    for _ in range(3):
        h = fetch_hash(url)
        if h is not None:
            counts[h] += 1
    if not counts:
        return None, False
    hash_val, freq = counts.most_common(1)[0]
    return hash_val, freq >= 2


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


def escalate_pricing_changed(provider, url, old_hash, new_hash):
    """A changed hash is evidence a human should look, never itself a reason
    to touch price/price_floor_usd — this function only opens the ask."""
    try:
        ap.open_or_merge_incident(
            kind="UNKNOWN", provider=provider, detected_by="limits", actor="pricing-recheck",
            evidence={"url": url, "prior_hash": old_hash, "new_hash": new_hash,
                      "detected_at": ap.now_iso()},
            what=(f"{provider}: содержимое источника pricing/limits изменилось с прошлой "
                  f"месячной проверки ({url}) — sha256 {old_hash[:12]}... -> {new_hash[:12]}... . "
                  f"Нужна ручная сверка цены/лимитов в provider-limits.json против живой страницы."),
            system_did="детерминированный diff по sha256 тела ответа (pricing-recheck.py, FT-7) — "
                       "модель не вызывалась и цена/price_floor_usd не менялись, решение принял "
                       "только факт несовпадения хэша с прошлым успешным прогоном",
        )
    except (AssertionError, RuntimeError) as e:
        ap.notice(f"pricing-recheck: failed to open pricing-changed incident for {provider}: {e}")


def main():
    config = load_provider_config()
    providers = list_providers_in_status()
    hash_state = load_hash_state()

    plan = {p: (config.get(p) or {}).get("docs_url") for p in providers}
    fetch_targets = {p: u for p, u in plan.items() if u}

    # Fetch phase: concurrent, network-only, no DB/incident side effects — a
    # plain dict collects results as futures complete, so a slow/hung URL
    # only holds up its own future, never the whole batch. Each task is
    # fetch_hash_voted (up to 3 sequential fetches of ONE provider's url),
    # not a single fetch — the vote (ruling-2) applies uniformly to baseline
    # and re-check alike, so it has to happen before the write phase knows
    # whether a given provider is "new" or "known".
    fetched = {}
    with ThreadPoolExecutor(max_workers=FETCH_CONCURRENCY) as pool:
        futures = {pool.submit(fetch_hash_voted, url): provider for provider, url in fetch_targets.items()}
        for future in as_completed(futures):
            fetched[futures[future]] = future.result()

    checked = 0
    escalated = 0
    fetch_failures = 0
    no_source = 0
    unstable = 0

    # Write phase: sequential, DB + incident side effects only — all fetching
    # (including the vote's refetches) already happened above, so this loop
    # is just bookkeeping and stays fast regardless of network latency.
    for provider in providers:
        url = plan[provider]
        if not url:
            update_pricing_checked(provider, NO_SOURCE)
            no_source += 1
            checked += 1
            continue

        new_hash, stable = fetched.get(provider, (None, False))
        if new_hash is None:
            update_pricing_checked(provider, f"{FETCH_FAILED_PREFIX}{url}")
            fetch_failures += 1
            checked += 1
            continue  # stored hash untouched: a transient fetch failure must
            # never look like "the page changed" on the next successful run.

        if not stable:
            # No hash reached 2-of-3 agreement: the page's own visible text
            # carries per-request noise (ruling-2), so nothing fetched this
            # pass is trustworthy as a diff target. Recorded distinctly from
            # a plain "<url>" so `pricing_source` never implies a clean
            # verified check where the page itself made verification
            # impossible. hash_state is left untouched (not cleared, not
            # written) so a later stable month still compares against the
            # last value that WAS trustworthy instead of drifting to noise.
            update_pricing_checked(provider, f"{UNSTABLE_PREFIX}{url}")
            unstable += 1
            checked += 1
            continue

        known = hash_state.get(provider, [])
        if not known:
            hash_state[provider] = [new_hash]
        elif new_hash not in known:
            escalate_pricing_changed(provider, url, known[-1], new_hash)
            escalated += 1
            hash_state[provider] = (known + [new_hash])[-MAX_KNOWN_HASHES:]
        # else: new_hash already a known stable rendering, nothing to update.

        update_pricing_checked(provider, url)
        checked += 1
        save_hash_state(hash_state)  # flushed per-provider (cheap, ~411 rows
        # max) so a run interrupted partway never loses already-fetched
        # baselines — each provider's own DB write + hash write land together.

    print(f"pricing-recheck: {checked}/{len(providers)} providers checked "
          f"({no_source} no_docs_url, {fetch_failures} fetch_failed, "
          f"{unstable} unstable, {escalated} escalated) at {ap.now_iso()}")


if __name__ == "__main__":
    main()
