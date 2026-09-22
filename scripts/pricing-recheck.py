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
this file — "does this byte hash match the last one" is the entire judgment
call (task's own rule: "код, а не модель"), same C0.1 "не изобретай новую
кассу" posture as provider-limit-alerts.py's own reliability-score marker
file.

Baseline hash state lives in a local JSON file (HASH_STATE_PATH below), not a
DB column/table — the column pair this task adds is WHEN/WHERE a check
happened, never a diffable payload, so it has nowhere to durably store
yesterday's hash without inventing an unasked-for table for that alone.
`pricing_source` (the DB column) is what a human reads; the hash file is
purely this script's own working state.

Run monthly via cron (0 5 1 * *) against apibase-postgres-1 (autopilot_common's
own default PG_CONTAINER) — NOT apibase-orchestra-postgres-1, a different
database entirely.
"""
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
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


def load_provider_config():
    with open(PROVIDER_LIMITS_PATH) as f:
        return json.load(f)


def load_hash_state():
    try:
        with open(HASH_STATE_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_hash_state(state):
    os.makedirs(os.path.dirname(HASH_STATE_PATH), exist_ok=True)
    tmp = HASH_STATE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2, sort_keys=True)
    os.replace(tmp, HASH_STATE_PATH)


def fetch_hash(url):
    """sha256 hex digest of the fetched body, or None on ANY failure (network,
    timeout, non-2xx, bad url) — None means "couldn't check this pass", never
    a fabricated hash that would silently read as "changed" on the next run
    that succeeds."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "APIbase-pricing-recheck/1.0"})
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_S) as resp:
            body = resp.read()
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError):
        return None
    return hashlib.sha256(body).hexdigest()


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
    # only holds up its own future, never the whole batch.
    fetched = {}
    with ThreadPoolExecutor(max_workers=FETCH_CONCURRENCY) as pool:
        futures = {pool.submit(fetch_hash, url): provider for provider, url in fetch_targets.items()}
        for future in as_completed(futures):
            fetched[futures[future]] = future.result()

    checked = 0
    escalated = 0
    fetch_failures = 0
    no_source = 0

    # Write phase: sequential, DB + incident side effects only — no network
    # calls here, so this part is fast regardless of fetch latency above.
    for provider in providers:
        url = plan[provider]
        if not url:
            update_pricing_checked(provider, NO_SOURCE)
            no_source += 1
            checked += 1
            continue

        new_hash = fetched.get(provider)
        if new_hash is None:
            update_pricing_checked(provider, f"{FETCH_FAILED_PREFIX}{url}")
            fetch_failures += 1
            checked += 1
            continue  # stored hash untouched: a transient fetch failure must
            # never look like "the page changed" on the next successful run.

        prior = hash_state.get(provider)
        if prior is not None and prior != new_hash:
            escalate_pricing_changed(provider, url, prior, new_hash)
            escalated += 1

        hash_state[provider] = new_hash
        update_pricing_checked(provider, url)
        checked += 1
        save_hash_state(hash_state)  # flushed per-provider (cheap, ~411 rows
        # max) so a run interrupted partway never loses already-fetched
        # baselines — each provider's own DB write + hash write land together.

    print(f"pricing-recheck: {checked}/{len(providers)} providers checked "
          f"({no_source} no_docs_url, {fetch_failures} fetch_failed, {escalated} escalated) "
          f"at {ap.now_iso()}")


if __name__ == "__main__":
    main()
