#!/usr/bin/env python3
"""margin-gate-alerts.py — F1/C-4: file/update a GitHub issue for every tool the
runtime TOOL_STATUS margin gate is currently refusing to serve.

Same pattern as provider-limit-alerts.py (this repo, hourly cron): re-derive the
violation from the DB directly (never from application logs — the hot path never
calls out to GitHub itself, see src/pipeline/stages/tool-status.stage.ts doc
comment), dedup by an existing open issue title prefix, idempotent re-run.

A tool shows up here iff price_usd < upstream_cost_usd * MARGIN_MULTIPLIER AND
upstream_cost_usd IS NOT NULL (rows still pending migration never match — see
scripts/migrate-upstream-cost.py). Every hit here is currently 503-ing real
clients; this is a revenue-protection alert, not a housekeeping one.

F6: MARGIN_MULTIPLIER used to be a second hardcoded `1.3` here (three literal
occurrences), independent of src/pipeline/stages/tool-status.stage.ts's own
`MARGIN_MULTIPLIER = 1.3` -- the same policy constant in two places with no
link between them. Now read from src/config/margin.json, the one file both the
TS runtime gate and this alert cron load.

T-11 (2026-09-05) / Fable ruling-1 decision A/B — two more checks, same cron,
same dedup-by-title-prefix idempotence, both READ-ONLY (never write price_usd,
never touch a provider, per this task's own boundary):

  - "Cost model stale: <tool_id>" — config/tool_provider_config.yaml's own
    `upstream_cost_remeasure_by` (per-tool, set when a cost was recorded) has
    passed. "A fact without a place it expires is not stale, it's WRONG" —
    this is that place's reader. Source of the date is the YAML, not the DB
    (the DB has no remeasure_by column; re-seeding is what would eventually
    clear a tool's staleness once someone re-measures and bumps the date).

  - "Cost model missing: <provider>" — a provider that DOES have a `billing`
    block in src/config/provider-limits.json (i.e. it's a confirmed-paid
    upstream, not a free one) but has at least one tool with
    tools.upstream_cost_usd still NULL. NOT_MEASURED in the YAML is an honest
    state (see decision B) but must not go unnoticed forever once real money
    is involved — this is that notice.
"""
import json
import subprocess
import sys
from datetime import datetime, timezone

import yaml

ROOT = "/home/apibase/apibase"
REPO = "whiteknightonhorse/APIbase"
TITLE_PREFIX = "Margin gate blocking: "
STALE_PREFIX = "Cost model stale: "
MISSING_PREFIX = "Cost model missing: "


with open(f"{ROOT}/src/config/margin.json") as f:
    MARGIN_MULTIPLIER = json.load(f)["MARGIN_MULTIPLIER"]


def load_yaml_tools():
    with open(f"{ROOT}/config/tool_provider_config.yaml") as f:
        cfg = yaml.safe_load(f)
    return cfg.get("tools", [])


def load_provider_billing():
    with open(f"{ROOT}/src/config/provider-limits.json") as f:
        limits = json.load(f)
    return {p: c["billing"] for p, c in limits.items() if isinstance(c.get("billing"), dict)}


def psql(sql):
    out = subprocess.run(
        ["docker", "exec", "apibase-postgres-1", "psql", "-U", "apibase", "-d", "apibase", "-tAF", "\t", "-c", sql],
        capture_output=True, text=True,
    )
    return out.stdout.strip()


def gh(*args):
    return subprocess.run(["gh", *args], capture_output=True, text=True, cwd=ROOT)


def open_issues_with_prefix(prefix):
    r = gh("issue", "list", "--repo", REPO, "--state", "open", "--search", f"{prefix} in:title",
           "--limit", "100", "--json", "number,title")
    try:
        issues = json.loads(r.stdout or "[]")
    except Exception:
        issues = []
    return {i["title"] for i in issues if i["title"].startswith(prefix)}


# ---------------------------------------------------------------------------
# Pure logic (--selftest exercises these without DB/gh) --------------------
# ---------------------------------------------------------------------------
def is_stale(remeasure_by_str, today):
    """True iff remeasure_by_str (YYYY-MM-DD) is on or before `today` (a date
    object). Missing or malformed input is never "stale" -- a tool that never
    recorded a remeasure date is NOT_MEASURED's own problem (decision B), not
    this check's; fabricating staleness off a bad string would be the same
    "guessed number" mistake this whole task exists to avoid, just about a
    date instead of a price."""
    if not remeasure_by_str:
        return False
    try:
        d = datetime.strptime(str(remeasure_by_str), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return False
    return d <= today


def find_stale_tools(tools, today):
    """Returns [(tool_id, provider, remeasure_by)] for every YAML tool row
    whose upstream_cost_remeasure_by has passed. Order-preserving, pure."""
    stale = []
    for t in tools:
        remeasure_by = t.get("upstream_cost_remeasure_by")
        if is_stale(remeasure_by, today):
            stale.append((t.get("tool_id"), t.get("provider"), remeasure_by))
    return stale


def find_margin_violations(rows):
    """rows: list of (tool_id, provider, price_usd, upstream_cost_usd) tuples
    (already filtered to upstream_cost_usd IS NOT NULL by the caller's SQL).
    Pure re-check of the same inequality tool-status.stage.ts's
    failsMarginGate() enforces, so --selftest can assert this script agrees
    with the runtime gate's own math without a DB."""
    multiplier = MARGIN_MULTIPLIER
    violations = []
    for tool_id, provider, price, cost in rows:
        required = round(float(cost) * multiplier, 8)
        if float(price) < required:
            violations.append((tool_id, provider, price, cost))
    return violations


# ---------------------------------------------------------------------------
# Check 1 (original): runtime margin gate blocking a tool right now
# ---------------------------------------------------------------------------
def check_margin_violations():
    rows_raw = psql(
        f"""
        SELECT tool_id, provider, price_usd, upstream_cost_usd
        FROM tools
        WHERE upstream_cost_usd IS NOT NULL
        ORDER BY tool_id
        """
    )
    rows = []
    if rows_raw:
        for line in rows_raw.splitlines():
            tool_id, provider, price, cost = line.split("\t")
            rows.append((tool_id, provider, price, cost))

    violations = find_margin_violations(rows)
    if not violations:
        print("margin-gate-alerts: 0 tools currently blocked — nothing to do")
        return

    multiplier = MARGIN_MULTIPLIER
    existing_titles = open_issues_with_prefix(TITLE_PREFIX)
    created = 0
    for tool_id, provider, price, cost in violations:
        title = f"{TITLE_PREFIX}{tool_id}"
        if title in existing_titles:
            print(f"skip (already open): {tool_id}")
            continue
        required = round(float(cost) * multiplier, 8)
        body = (
            f"Runtime margin gate (TOOL_STATUS stage, F1/C-4) is refusing to serve **`{tool_id}`** "
            f"(provider `{provider}`) — clients get 503.\n\n"
            f"- `price_usd` = {price}\n"
            f"- `upstream_cost_usd` = {cost}\n"
            f"- required minimum (cost × {multiplier}) = {required}\n\n"
            f"Fix by raising `price_usd` for this tool in `config/tool_provider_config.yaml` to at "
            f"least {required}, or re-verify `upstream_cost_usd` if it was migrated wrong, then re-seed. "
            f"Auto-detected by margin-gate-alerts (hourly)."
        )
        r = gh("issue", "create", "--repo", REPO, "--title", title, "--body", body)
        ok = r.returncode == 0
        print(f"{'created' if ok else 'FAILED'}: {title} -> {(r.stdout or r.stderr).strip().splitlines()[-1] if (r.stdout or r.stderr) else ''}")
        if ok:
            created += 1

    print(f"margin-gate-alerts: {len(violations)} blocked tool(s), {created} new issue(s) filed")


# ---------------------------------------------------------------------------
# Check 2 (T-11 decision A): a recorded cost has passed its own expiry date
# ---------------------------------------------------------------------------
def check_stale_cost_models():
    today = datetime.now(timezone.utc).date()
    tools = load_yaml_tools()
    stale = find_stale_tools(tools, today)
    if not stale:
        print("margin-gate-alerts: 0 tool cost models stale — nothing to do")
        return

    existing_titles = open_issues_with_prefix(STALE_PREFIX)
    created = 0
    for tool_id, provider, remeasure_by in stale:
        title = f"{STALE_PREFIX}{tool_id}"
        if title in existing_titles:
            print(f"skip (already open): {tool_id}")
            continue
        body = (
            f"`{tool_id}` (provider `{provider}`) carries an `upstream_cost_usd` recorded in "
            f"`config/tool_provider_config.yaml` whose own `upstream_cost_remeasure_by: {remeasure_by}` "
            f"has passed (today {today.isoformat()}). \"A fact without a place it expires is not "
            f"stale, it's wrong\" — this cost needs a fresh look at the provider's current pricing "
            f"page/billing screen before it can be trusted for the margin gate. Auto-detected by "
            f"margin-gate-alerts (hourly)."
        )
        r = gh("issue", "create", "--repo", REPO, "--title", title, "--body", body)
        ok = r.returncode == 0
        print(f"{'created' if ok else 'FAILED'}: {title} -> {(r.stdout or r.stderr).strip().splitlines()[-1] if (r.stdout or r.stderr) else ''}")
        if ok:
            created += 1

    print(f"margin-gate-alerts: {len(stale)} stale cost model(s), {created} new issue(s) filed")


# ---------------------------------------------------------------------------
# Check 3 (T-11 decision B): a confirmed-paid provider still has NULL cost
# ---------------------------------------------------------------------------
def check_missing_cost_models():
    billed_providers = load_provider_billing()
    if not billed_providers:
        print("margin-gate-alerts: 0 providers with a billing block — nothing to do")
        return

    rows_raw = psql(
        "SELECT provider, count(*) FROM tools WHERE upstream_cost_usd IS NULL GROUP BY provider"
    )
    null_counts = {}
    if rows_raw:
        for line in rows_raw.splitlines():
            provider, n = line.split("\t")
            null_counts[provider] = int(n)

    missing = [(p, null_counts[p]) for p in billed_providers if p in null_counts]
    if not missing:
        print("margin-gate-alerts: 0 billed providers with a missing cost model — nothing to do")
        return

    existing_titles = open_issues_with_prefix(MISSING_PREFIX)
    created = 0
    for provider, n in missing:
        title = f"{MISSING_PREFIX}{provider}"
        if title in existing_titles:
            print(f"skip (already open): {provider}")
            continue
        billing = billed_providers[provider]
        body = (
            f"Provider `{provider}` is confirmed paid (`src/config/provider-limits.json` has a "
            f"`billing` block: {json.dumps(billing)}) but **{n} tool(s)** still have "
            f"`tools.upstream_cost_usd = NULL` — NOT_MEASURED is an honest state (a real number "
            f"beats a guessed one), but once real money is involved it must not go unnoticed "
            f"forever. Record a sourced cost in `config/tool_provider_config.yaml` (see T-11's own "
            f"entries for `zyte`/`api2pdf` as the pattern) and re-seed. Auto-detected by "
            f"margin-gate-alerts (hourly)."
        )
        r = gh("issue", "create", "--repo", REPO, "--title", title, "--body", body)
        ok = r.returncode == 0
        print(f"{'created' if ok else 'FAILED'}: {title} -> {(r.stdout or r.stderr).strip().splitlines()[-1] if (r.stdout or r.stderr) else ''}")
        if ok:
            created += 1

    print(f"margin-gate-alerts: {len(missing)} billed provider(s) with missing cost model, {created} new issue(s) filed")


def main():
    check_margin_violations()
    check_stale_cost_models()
    check_missing_cost_models()
    return 0


# ---------------------------------------------------------------------------
# Selftest: pure logic only, no DB/gh (same split as provider-limit-alerts.py)
# ---------------------------------------------------------------------------
def selftest():
    today = datetime(2026, 9, 5, tzinfo=timezone.utc).date()

    # --- is_stale ---
    assert is_stale("2026-09-05", today) is True, "remeasure_by == today must count as stale (due today)"
    assert is_stale("2026-09-04", today) is True, "remeasure_by in the past must be stale"
    assert is_stale("2026-09-06", today) is False, "remeasure_by in the future must NOT be stale"
    assert is_stale(None, today) is False, "no remeasure_by recorded -> never fabricated as stale"
    assert is_stale("", today) is False
    assert is_stale("not-a-date", today) is False, "malformed date -> False, not a crash, not a guess"

    # --- find_stale_tools ---
    tools = [
        {"tool_id": "scrape.browser", "provider": "zyte", "upstream_cost_remeasure_by": "2026-09-30"},
        {"tool_id": "old.tool", "provider": "somebody", "upstream_cost_remeasure_by": "2026-01-01"},
        {"tool_id": "no.date", "provider": "somebody"},
    ]
    stale = find_stale_tools(tools, today)
    assert stale == [("old.tool", "somebody", "2026-01-01")], f"expected only old.tool stale, got {stale}"

    # --- find_margin_violations (agrees with tool-status.stage.ts's failsMarginGate) ---
    # Same MARGIN_MULTIPLIER=1.3 fixture as this repo's real src/config/margin.json.
    rows = [
        ("scrape.browser", "zyte", "0.015", "0.01608"),   # required=0.020904 > 0.015 -> violation
        ("scrape.extract", "zyte", "0.003", "0.00127"),   # required=0.001651 <= 0.003 -> OK
    ]
    violations = find_margin_violations(rows)
    assert violations == [("scrape.browser", "zyte", "0.015", "0.01608")], (
        f"expected only scrape.browser to violate, got {violations}"
    )

    print("margin-gate-alerts --selftest: OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        raise SystemExit(0)
    raise SystemExit(main())
