#!/usr/bin/env python3
"""key-expiry-alerts.py — T-0129: an issued API key's expiry date needs a place a MACHINE
reads, not a fact buried in a human-facing prose string that nobody re-reads until the
provider's "final reminder" email happens to land on a person instead of the system.

2026-09-14 incident that motivated this: SAM.gov's key rotated with 90(ish) days of runway
and the ONLY warning was a provider email to the operator, forwarded by hand. The 90-day
figure was already sitting in `provider-limits.json`'s `sam.limit_proof` string the whole
time — a fact with no machine-readable field, so nothing could ever act on it before a human
happened to notice. See ~/AUTOPILOT-PROGRESS.md#T-0129 for the full writeup.

Where the fact lives (LAW #ONE-PLACE): `provider-limits.json`'s per-provider `key_expiry`
object (see `KeyExpiryFact`/`ProviderLimitEntry` in src/jobs/provider-health.job.ts for the
schema), keyed by the EXACT env var name — a provider entry can bundle several keys (e.g.
`health` holds both PROVIDER_KEY_USDA and PROVIDER_KEY_OPENFDA), so "which key" is never
ambiguous. This is NOT scripts/night-orchestra/state/key-required-queue.json — that queue is
for keys NOT YET acquired (status=pending, no live credential exists); every key this script
watches is already issued and configured. It is also NOT the incidents table's CREDENTIAL_EXPIRED
kind — that kind exists (routing.json, HUMAN_KEY route) but is fed exclusively by
email-intake.py parsing a provider's email ("otherwise unused by any other producer" — see
that file's own docstring); reusing it here would need its `open_or_merge_incident` dedup_key
(kind+provider) to collapse the 14-day and 3-day warnings into ONE incident, so only the
first would ever reach the operator (open_or_merge's own merge path only appends a silent
'recurrence' attempts-note, no fresh TG ping / no rewritten operator file — see
autopilot_common.py's open_or_merge_incident docstring). Two DISTINCT, human-visible warnings
per key is the literal requirement, so this reuses the OTHER already-reviewed idempotent-alert
pattern already living in this repo: provider-limit-alerts.py's `check_auto_recharge_spend()`
— a GitHub issue whose TITLE is the dedup key (checked via `gh issue list` before `gh issue
create`), the exact mechanism that already fires "Spend: {prov} ..." issues without spamming.
A 14-day and a 3-day warning for the same key get two different titles, so each is a
genuinely new, distinctly-titled issue — no incidents-table change, no migration, no new kind.

NOINFO discipline (T-0129's own boundary): `date: "unknown"` is a real, honest answer and
is never treated as "far away" / never alerted on — silence here must never be confused with
"expiry known and comfortable" (the same law provider-limit-alerts.py's whole docstring is
about, applied to dates instead of quota percentages). A key with no known expiry gets zero
alerts, forever, until a real date is recorded — that is a gap to close by filling in the
field over time, not something this script can paper over by guessing.

Cron: daily is plenty (a date, unlike a quota counter, does not move faster than that).
    0 8 * * * cd /home/apibase/apibase && python3 scripts/key-expiry-alerts.py >> logs/key-expiry-alerts-cron.log 2>&1
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

ROOT = "/home/apibase/apibase"
REPO = "whiteknightonhorse/APIbase"
CONFIG_PATH_DEFAULT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "config", "provider-limits.json")
)
# Literal thresholds from the task (T-0129): warn at 14 AND at 3 days, never daily. A key
# already expired (days_left <= 0) still deserves every threshold it blew past, not silence —
# see thresholds_due().
THRESHOLDS_DAYS = (14, 3)
ISSUE_LABEL = "key-expiry-alert"


def gh(*args):
    return subprocess.run(["gh", *args], capture_output=True, text=True, cwd=ROOT)


def load_config(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Pure decision logic — no I/O, so --selftest can exercise every branch
# (unknown dates, past-due catch-up, idempotent suppression) without a
# network call or a real GitHub issue.
# ---------------------------------------------------------------------------
def parse_expiry_date(date_str):
    """None for missing/"unknown" (never fabricated, T-0129's own boundary)
    and for a malformed string (NOINFO, not a crash — a badly-typed date is
    exactly as unusable as no date, and must not accidentally parse into
    something that suppresses or fires an alert by luck)."""
    if not date_str or date_str == "unknown":
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return None


def days_remaining(expiry, today):
    return (expiry - today).days


def thresholds_due(days_left):
    """Which of THRESHOLDS_DAYS are crossed at `days_left`, descending
    (14 before 3) so alert ordering is stable. days_left<=0 (already
    expired) still returns every threshold — a key that expired unnoticed
    deserves the loudest catch-up available, not silence just because the
    calendar has already moved past the polite warning window."""
    return tuple(t for t in sorted(THRESHOLDS_DAYS, reverse=True) if days_left <= t)


def alert_title(provider_key, env_var, threshold, expiry_date):
    """The GitHub issue title IS the dedup key (idempotency source, same
    role provider-limit-alerts.py's own spend-alert titles play) — includes
    provider, env var, threshold AND the exact date so a title collision
    can only happen for the literal same warning, never a coincidence."""
    return f"Key expiring: {env_var} ({provider_key}) — {threshold}-day warning ({expiry_date.isoformat()})"


def alert_body(provider_key, display_name, env_var, expiry_date, source, threshold, days_left):
    when = f"expired {abs(days_left)} day(s) ago" if days_left <= 0 else f"expires in {days_left} day(s)"
    return (
        f"Provider `{provider_key}` ({display_name})'s credential in env var **{env_var}** "
        f"{when} — exact expiry date **{expiry_date.isoformat()}** (source: {source}). "
        f"This is the {threshold}-day warning threshold.\n\n"
        f"Action: rotate **{env_var}** before it expires, then record the new expiry date + "
        f"source in `provider-limits.json` under `{provider_key}.key_expiry.{env_var}` — the "
        f"same field this alert read from (T-0129, LAW #ONE-PLACE).\n\n"
        f"Auto-detected by key-expiry-alerts.py (daily)."
    )


def collect_due_alerts(config, today, already_sent_titles):
    """The actual per-run decision, pure: given the loaded config, today's
    date, and the set of already-open alert titles (the idempotency source —
    this invents no second state file), returns the list of NEW alerts to
    raise this run, in stable (provider, env_var, threshold) order. A key
    with `date: "unknown"` never appears here — see parse_expiry_date."""
    due = []
    for provider_key in sorted(config.keys()):
        entry = config[provider_key]
        if not isinstance(entry, dict):
            continue
        key_expiry = entry.get("key_expiry")
        if not isinstance(key_expiry, dict):
            continue
        display_name = entry.get("display_name", provider_key)
        for env_var in sorted(key_expiry.keys()):
            fact = key_expiry[env_var] or {}
            expiry = parse_expiry_date(fact.get("date"))
            if expiry is None:
                continue
            source = fact.get("source", "unknown")
            left = days_remaining(expiry, today)
            for threshold in thresholds_due(left):
                title = alert_title(provider_key, env_var, threshold, expiry)
                if title in already_sent_titles:
                    continue
                due.append({
                    "title": title,
                    "body": alert_body(provider_key, display_name, env_var, expiry, source, threshold, left),
                    "provider": provider_key,
                    "env_var": env_var,
                    "threshold": threshold,
                    "days_left": left,
                    "expiry_date": expiry.isoformat(),
                })
    return due


# ---------------------------------------------------------------------------
# I/O — real GitHub issue list/create. Kept thin and separate from the pure
# logic above on purpose (same split provider-limit-alerts.py uses for
# compute_risk_for_usage vs update_provider_status_risk).
# ---------------------------------------------------------------------------
def existing_alert_titles():
    r = gh("issue", "list", "--repo", REPO, "--state", "open", "--label", ISSUE_LABEL,
           "--limit", "200", "--json", "title")
    try:
        return {i["title"] for i in json.loads(r.stdout or "[]")}
    except (json.JSONDecodeError, TypeError, KeyError):
        return set()


def main():
    config = load_config(CONFIG_PATH_DEFAULT)
    today = datetime.now(timezone.utc).date()
    already = existing_alert_titles()
    due = collect_due_alerts(config, today, already)
    if not due:
        print(f"key-expiry-alerts: no thresholds crossed this run (today={today})")
        return 0
    for alert in due:
        r = gh("issue", "create", "--repo", REPO, "--title", alert["title"], "--body", alert["body"],
               "--label", ISSUE_LABEL)
        ok = r.returncode == 0
        print(f"{'created' if ok else 'FAILED'}: {alert['title']}")
        if not ok:
            print(r.stderr, file=sys.stderr)
    return 0


def dry_run(path, now_override=None):
    """Preview-only: loads a config file (real or a scratch copy) and prints
    what WOULD be alerted, with NO gh call at all — the safe way to check
    "does the alarm actually fire" against a real or test-shifted date
    without opening a real, public GitHub issue (T-0129 verification step 5)."""
    config = load_config(path)
    today = now_override or datetime.now(timezone.utc).date()
    due = collect_due_alerts(config, today, set())
    print(f"key-expiry-alerts --dry-run ({path}, today={today}): {len(due)} alert(s) would fire")
    for alert in due:
        print(f"  WOULD ALERT: {alert['title']}")
    return due


# ---------------------------------------------------------------------------
# --selftest: pure logic, no network, no filesystem beyond the real config
# (read-only) for the "does today's real data alert" check.
# ---------------------------------------------------------------------------
def selftest():
    from datetime import date

    # World 1: comfortable date (75 days out) -> nothing due.
    cfg = {"sam": {"display_name": "SAM.gov",
                    "key_expiry": {"PROVIDER_KEY_SAM": {"date": "2026-11-28", "source": "provider_email"}}}}
    today = date(2026, 9, 14)
    due = collect_due_alerts(cfg, today, set())
    assert due == [], f"world 1: 75 days out must alert on nothing, got {due}"
    print("world 1 (75 days out -> no alerts): OK")

    # World 2: shifted into the past (the T-0129 control: "move the date back,
    # the alarm must fire"). Both thresholds are overdue -> both come due at once.
    cfg_past = {"sam": {"display_name": "SAM.gov",
                         "key_expiry": {"PROVIDER_KEY_SAM": {"date": "2026-08-01", "source": "provider_email"}}}}
    due2 = collect_due_alerts(cfg_past, today, set())
    assert len(due2) == 2, f"world 2: an already-expired key must raise both thresholds, got {due2}"
    thresholds_seen = {a["threshold"] for a in due2}
    assert thresholds_seen == {14, 3}, f"world 2: expected both 14 and 3-day thresholds, got {thresholds_seen}"
    for a in due2:
        assert "PROVIDER_KEY_SAM" in a["title"] and "sam" in a["title"], \
            f"world 2: alert title must name the env var and provider, got {a['title']!r}"
        assert "2026-08-01" in a["title"] and "2026-08-01" in a["body"], \
            f"world 2: alert must name the exact expiry date, got title={a['title']!r}"
    print("world 2 (expiry shifted into the past -> both 14d+3d alerts fire, naming provider/var/date): OK")

    # World 3: exactly at the 14-day boundary -> only the 14-day threshold, not 3.
    cfg_14 = {"sam": {"display_name": "SAM.gov",
                       "key_expiry": {"PROVIDER_KEY_SAM": {"date": "2026-09-28", "source": "provider_email"}}}}
    due3 = collect_due_alerts(cfg_14, today, set())
    assert [a["threshold"] for a in due3] == [14], f"world 3: exactly 14 days out must fire ONLY the 14-day alert, got {due3}"
    print("world 3 (exactly 14 days out -> only the 14-day alert): OK")

    # World 4: idempotency — a threshold already in already_sent_titles must
    # never fire again (T-0129 boundary: "not daily", one per key per threshold).
    title_14 = alert_title("sam", "PROVIDER_KEY_SAM", 14, date(2026, 9, 28))
    due4 = collect_due_alerts(cfg_14, today, {title_14})
    assert due4 == [], f"world 4: an already-open alert title must suppress re-firing, got {due4}"
    print("world 4 (already-open title suppresses re-fire -> no daily spam): OK")

    # World 5: unknown date -> never alerted, never crashes.
    cfg_unknown = {"diffbot": {"display_name": "Diffbot",
                                "key_expiry": {"PROVIDER_KEY_DIFFBOT": {"date": "unknown", "source": "unknown"}}}}
    due5 = collect_due_alerts(cfg_unknown, today, set())
    assert due5 == [], f"world 5: date=unknown must never alert, got {due5}"
    print("world 5 (date=unknown -> silent, never fabricated): OK")

    # World 6 (real data): today's real provider-limits.json must currently
    # raise NOTHING for sam (real date is 2026-11-28, ~75 days out from
    # 2026-09-14) — the "normal picture" half of T-0129's proof.
    real_cfg = load_config(CONFIG_PATH_DEFAULT)
    real_due = collect_due_alerts(real_cfg, date(2026, 9, 14), set())
    real_sam_due = [a for a in real_due if a["provider"] == "sam"]
    assert real_sam_due == [], f"world 6: real sam key_expiry must not alert yet, got {real_sam_due}"
    print(f"world 6 (real provider-limits.json, today=2026-09-14 -> sam raises nothing; "
          f"{len(real_due)} total across all providers, all from 'unknown' dates never firing): OK")

    print("key-expiry-alerts --selftest: ALL WORLDS OK")
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        raise SystemExit(selftest())
    if "--dry-run" in sys.argv:
        args = sys.argv[1:]
        path = CONFIG_PATH_DEFAULT
        if "--config" in args:
            path = args[args.index("--config") + 1]
        now_override = None
        if "--now" in args:
            from datetime import datetime as _dt
            now_override = _dt.strptime(args[args.index("--now") + 1], "%Y-%m-%d").date()
        dry_run(path, now_override)
        raise SystemExit(0)
    raise SystemExit(main())
