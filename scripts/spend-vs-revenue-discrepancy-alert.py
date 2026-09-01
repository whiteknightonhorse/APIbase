#!/usr/bin/env python3
"""spend-vs-revenue-discrepancy-alert.py — F1 closing item (corrected framing,
2026-09-01): the earlier "card-spend alarm" was mis-specified — it assumed a
bank/card-issuer API connection that will never exist by design (crypto-only
client payments). The correct signal needs no external data source at all:
it is measured entirely from OUR OWN records.

  SPEND (known)   = for every tool with upstream_cost_usd on record (F1/C-4),
                    sum of upstream_cost_usd over yesterday's calls that
                    actually reached the provider (provider_called=true).
  REVENUE (known) = for those SAME tools, yesterday's ledger revenue actually
                    collected (billing_status='PAID'), any payment rail.

Alert fires on the INEQUALITY revenue_known < spend_known — no dollar
threshold, per the operator's own framing: this is the "no payment, no
upstream call" invariant measured in aggregate. If that invariant leaked
somewhere in the pipeline we have not found yet, this discrepancy will show
up even without knowing where the hole is.

upstream_cost_usd is not filled for every provider (F1/C-4 migration is
incremental, by design — never guessed). So this can only ever speak for the
providers it covers: it ALWAYS prints coverage (X of Y paid providers have a
real cost on record) alongside the numbers, so a healthy-looking result never
silently claims to cover the whole platform when it doesn't.

Known, accepted source of noise (not filtered out, deliberately): a
legitimate refund for a failed provider call (real upstream cost incurred,
client refunded) also produces a same-day discrepancy. The operator chose
"any inequality pages" over trying to distinguish "refund" from "leak"
automatically — a human reading the numbers can tell the difference in
seconds; silently filtering refunds risks filtering out an actual leak that
happens to look like one.

Daily cron (02:00 UTC) — compares the FULL previous UTC day, never a partial
"today so far" which would read as a false discrepancy before the day ends.
"""
import json
import subprocess
import os
from datetime import datetime, timedelta, timezone

ROOT = "/home/apibase/apibase"
STATE = f"{ROOT}/scripts/night-orchestra/state"


def load_tg_env():
    env = {}
    path = f"{STATE}/tg.env"
    if not os.path.exists(path):
        return env
    for line in open(path):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k] = v.strip('"').strip("'")
    return env


def psql_json(sql):
    """Run a query and return its single-row result as a dict, using
    row_to_json so field types/NULLs survive without hand-rolled field
    splitting (this query mixes counts, decimals, and can have NULL sums)."""
    out = subprocess.run(
        ["docker", "exec", "apibase-postgres-1", "psql", "-U", "apibase", "-d", "apibase",
         "-tA", "-c", f"SELECT row_to_json(r) FROM ({sql}) r"],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        print(f"spend-vs-revenue: psql failed: {out.stderr.strip()}")
        raise SystemExit(1)
    line = out.stdout.strip()
    if not line:
        return {}
    return json.loads(line)


coverage = psql_json(
    """
    SELECT
      count(DISTINCT provider) FILTER (WHERE upstream_cost_usd IS NOT NULL) AS covered_providers,
      count(DISTINCT provider) AS total_paid_providers
    FROM tools
    WHERE price_usd > 0
    """
)
covered = coverage.get("covered_providers") or 0
total = coverage.get("total_paid_providers") or 0
coverage_pct = round(100 * covered / total, 1) if total else 0.0

numbers = psql_json(
    """
    SELECT
      COALESCE(SUM(t.upstream_cost_usd) FILTER (WHERE el.provider_called), 0)::float8 AS spend_known,
      COALESCE(SUM(el.cost_usd) FILTER (WHERE el.billing_status = 'PAID'), 0)::float8 AS revenue_known,
      count(*) FILTER (WHERE el.provider_called) AS calls_to_known_upstream
    FROM execution_ledger el
    JOIN tools t ON t.tool_id = el.tool_id
    WHERE t.upstream_cost_usd IS NOT NULL
      AND el.created_at >= (current_date - interval '1 day')
      AND el.created_at <  current_date
    """
)
spend = numbers.get("spend_known") or 0.0
revenue = numbers.get("revenue_known") or 0.0
calls = numbers.get("calls_to_known_upstream") or 0

report_date = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()

coverage_line = f"upstream_cost_usd coverage: {covered}/{total} paid providers ({coverage_pct}%)"

if revenue < spend:
    tg = load_tg_env()
    token = tg.get("TG_BOT_TOKEN")
    chat_id = tg.get("TG_CHAT_ID")
    text = (
        f"[apibase] ⚠️ Spend-vs-revenue discrepancy for {report_date} (own records only, "
        f"no bank/card data) — revenue collected is LESS than upstream cost incurred for tools "
        f"with a known cost.\n"
        f"spend (known upstream cost): ${spend:.6f}\n"
        f"revenue (known, PAID): ${revenue:.6f}\n"
        f"gap: ${spend - revenue:.6f}\n"
        f"calls to known-cost providers: {calls}\n"
        f"{coverage_line}\n"
        f"Known noise source: a legitimate refund for a failed provider call also produces this — "
        f"check execution_ledger billing_status='REFUNDED' for {report_date} before assuming a leak."
    )
    if token and chat_id:
        r = subprocess.run(
            ["curl", "-sS", "--max-time", "30", "-F", f"chat_id={chat_id}", "-F", f"text={text}",
             f"https://api.telegram.org/bot{token}/sendMessage"],
            capture_output=True, text=True,
        )
        if '"ok":true' not in r.stdout:
            print(f"spend-vs-revenue: DISCREPANCY found but Telegram send FAILED: {text}")
            raise SystemExit(1)
    print(f"spend-vs-revenue: DISCREPANCY for {report_date} — spend ${spend:.6f} > revenue ${revenue:.6f}, paged. {coverage_line}")
    raise SystemExit(0)

print(
    f"spend-vs-revenue: {report_date} OK — revenue ${revenue:.6f} >= spend ${spend:.6f} "
    f"({calls} calls to known-cost providers). {coverage_line}"
)
