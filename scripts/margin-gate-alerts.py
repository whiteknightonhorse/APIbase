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

T-01 (2026-09-05) / Fable ruling-1 (dispute 01-law-never-sell-below-cost) decision C — a
fourth check, same cron, same dedup-by-title-prefix idempotence, READ-ONLY:

  - "Price below floor: <tool_id>" — tools.price_floor_usd (migration 0013) is a DIFFERENT
    fact from upstream_cost_usd: it's the lowest price_usd a tool may legally carry, written
    only when an operator order or a documented-max fallback set it without necessarily also
    setting a matching cost measurement. A row can be here with upstream_cost_usd still NULL
    (check 1 above would stay silent on it) — this check exists precisely for that gap.

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
import os
import subprocess
import sys
from datetime import datetime, timezone

import yaml
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "autopilot"))
from autopilot_common import tg_send  # noqa: E402
import ops_issues  # noqa: E402

DEPLOY_ROOT = "/home/apibase/apibase"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = ops_issues.OPS_ISSUES_REPO
TITLE_PREFIX = "Margin gate blocking: "
STALE_PREFIX = "Cost model stale: "
MISSING_PREFIX = "Cost model missing: "
FLOOR_PREFIX = "Price below floor: "
COVERAGE_TITLE = "Margin gate coverage below threshold"
COVERAGE_MIN_PCT = 90.0


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
    return subprocess.run(["gh", *ops_issues.scrub_gh_args(args)], capture_output=True, text=True, cwd=ROOT)


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


def find_floor_violations(rows):
    """rows: list of (tool_id, provider, price_usd, price_floor_usd) tuples (already filtered
    to price_floor_usd IS NOT NULL by the caller's SQL). Pure re-check of the SAME inequality
    failsMarginGate() enforces via price_floor_usd (tool-status.stage.ts, T-01 decision C1),
    so --selftest can assert this script agrees with the runtime gate's own math without a
    DB. Deliberately separate from find_margin_violations above -- a floor violation can exist
    with upstream_cost_usd still NULL, which that function never sees."""
    violations = []
    for tool_id, provider, price, floor in rows:
        if float(price) < float(floor):
            violations.append((tool_id, provider, price, floor))
    return violations


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


# ---------------------------------------------------------------------------
# Check 4 (T-01 decision C): a tool is priced below its own price floor
# ---------------------------------------------------------------------------
def check_price_below_floor():
    rows_raw = psql(
        """
        SELECT tool_id, provider, price_usd, price_floor_usd
        FROM tools
        WHERE price_floor_usd IS NOT NULL
        ORDER BY tool_id
        """
    )
    rows = []
    if rows_raw:
        for line in rows_raw.splitlines():
            tool_id, provider, price, floor = line.split("\t")
            rows.append((tool_id, provider, price, floor))

    violations = find_floor_violations(rows)
    if not violations:
        print("margin-gate-alerts: 0 tools priced below their floor — nothing to do")
        return

    existing_titles = open_issues_with_prefix(FLOOR_PREFIX)
    created = 0
    for tool_id, provider, price, floor in violations:
        title = f"{FLOOR_PREFIX}{tool_id}"
        if title in existing_titles:
            print(f"skip (already open): {tool_id}")
            continue
        body = (
            f"**`{tool_id}`** (provider `{provider}`) is priced at `price_usd` = {price}, "
            f"below its own `price_floor_usd` = {floor} (`tools` table, migration 0013). "
            f"The runtime margin gate (TOOL_STATUS stage) is refusing to serve it if it's in a "
            f"selling status, and `sync_tool_status()` will not auto-promote it if it isn't. "
            f"Fix by raising `price_usd` to at least {floor} in `config/tool_provider_config.yaml` "
            f"and re-seeding, per the T-01 law (never sell below cost). "
            f"Auto-detected by margin-gate-alerts (hourly)."
        )
        r = gh("issue", "create", "--repo", REPO, "--title", title, "--body", body)
        ok = r.returncode == 0
        print(f"{'created' if ok else 'FAILED'}: {title} -> {(r.stdout or r.stderr).strip().splitlines()[-1] if (r.stdout or r.stderr) else ''}")
        if ok:
            created += 1

    print(f"margin-gate-alerts: {len(violations)} tool(s) below floor, {created} new issue(s) filed")


# ---------------------------------------------------------------------------
# Check 5 (T-0352): how much of the paid catalog the gate can actually see
# ---------------------------------------------------------------------------
def coverage_stats(rows):
    """rows: [(price_usd, upstream_cost_usd_or_empty)] for every tool. Returns
    (with_cost, paid_tools, pct). A tool is paid iff price_usd > 0; it is covered iff
    upstream_cost_usd is set (an explicit "0" counts). Pure, so --selftest needs no DB."""
    paid = [(p, c) for p, c in rows if float(p) > 0]
    with_cost = sum(1 for _, c in paid if c not in ("", None))
    pct = 100.0 * with_cost / len(paid) if paid else 100.0
    return with_cost, len(paid), pct


def coverage_line(with_cost, paid, pct):
    return f"coverage: {with_cost}/{paid} ({pct:.1f}%)"


def coverage_tg_text(with_cost, paid, pct):
    return (f"[apibase] margin gate coverage FAIL -- {coverage_line(with_cost, paid, pct)}, below the "
            f"{COVERAGE_MIN_PCT:.0f}% minimum. 'margin gate: 0 below floor' describes only the covered "
            f"fraction. See issue \"{COVERAGE_TITLE}\".")


def check_coverage():
    """Returns True when coverage >= COVERAGE_MIN_PCT. Below it, the '0 below floor' lines
    above only describe the covered fraction, so this is a visible red (exit 1)."""
    rows_raw = psql("SELECT price_usd, coalesce(upstream_cost_usd::text, '') FROM tools")
    rows = []
    for line in rows_raw.splitlines() if rows_raw else []:
        # psql() strips the output, which can drop the trailing tab of an empty-cost last row
        price, _, cost = line.partition("\t")
        rows.append((price, cost))
    with_cost, paid, pct = coverage_stats(rows)
    print(f"margin-gate-alerts: {coverage_line(with_cost, paid, pct)}")
    if pct >= COVERAGE_MIN_PCT:
        return True
    print(f"margin-gate-alerts: FAIL coverage {pct:.1f}% < {COVERAGE_MIN_PCT:.0f}% -- the margin gate "
          f"does not see {paid - with_cost} paid tool(s)")
    if COVERAGE_TITLE not in open_issues_with_prefix(COVERAGE_TITLE):
        body = (
            f"{coverage_line(with_cost, paid, pct)} -- below the {COVERAGE_MIN_PCT:.0f}% minimum. "
            f"`upstream_cost_usd` is unset on {paid - with_cost} paid tool(s), so 'margin gate: 0 below "
            f"floor' is true only for the covered fraction. Run `python3 scripts/backfill-upstream-cost.py` "
            f"(dry run) for the zero-cost backfill and the list of paid providers needing a sourced "
            f"cost model. Auto-detected by margin-gate-alerts (hourly)."
        )
        r = gh("issue", "create", "--repo", REPO, "--title", COVERAGE_TITLE, "--body", body)
        print(f"{'created' if r.returncode == 0 else 'FAILED'}: {COVERAGE_TITLE}")
        # Telegram only alongside a new issue (same dedup), so it is not re-sent every hour
        ok = tg_send(coverage_tg_text(with_cost, paid, pct))
        print(f"telegram {'sent' if ok else 'FAILED'}: {COVERAGE_TITLE}")
    return False


def main():
    check_margin_violations()
    check_stale_cost_models()
    check_missing_cost_models()
    check_price_below_floor()
    return 0 if check_coverage() else 1


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

    # --- find_floor_violations (agrees with tool-status.stage.ts's failsMarginGate) ---
    floor_rows = [
        ("scrape.screenshot", "zyte", "0.005", "0.024"),  # 0.005 < 0.024 -> violation
        ("scrape.browser", "zyte", "0.015", "0.01"),      # 0.015 >= 0.01 -> OK
    ]
    floor_violations = find_floor_violations(floor_rows)
    assert floor_violations == [("scrape.screenshot", "zyte", "0.005", "0.024")], (
        f"expected only scrape.screenshot to violate its floor, got {floor_violations}"
    )

    # --- coverage_stats ---
    assert coverage_stats([("0.01", "0"), ("0.01", ""), ("0", ""), ("0.02", "0.005")]) == (2, 3, 100.0 * 2 / 3), \
        "explicit 0 counts as covered; free (price 0) tools are not in the denominator"
    assert coverage_stats([])[2] == 100.0
    assert coverage_line(2, 3, 100.0 * 2 / 3) == "coverage: 2/3 (66.7%)"
    assert "coverage: 2/3 (66.7%)" in coverage_tg_text(2, 3, 100.0 * 2 / 3)

    print("margin-gate-alerts --selftest: OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        raise SystemExit(0)
    raise SystemExit(main())
