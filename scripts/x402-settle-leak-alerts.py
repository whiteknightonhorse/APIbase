#!/usr/bin/env python3
# outbox-worker owns only HANDLED_EVENT_TYPES (src/outbox/processor.ts) and never marks this type
"""x402-settle-leak-alerts.py — F1/C-7: page on every 'x402_settle_failed' outbox
event that hasn't been alerted yet (T-0675: ONE digest message per run, not one per row).

Unlike margin-gate-alerts.py / provider-limit-alerts.py (GitHub issues — housekeeping-
paced), a settle failure means a client ALREADY got paid-for data for free, right now,
real money — so this pages Telegram directly (state/tg.env, same bot/chat every other
night-orchestra alert uses) rather than filing an issue someone reads tomorrow. Runs
every 5 minutes (see crontab), not hourly.

Idempotent: marks the rows `processed=true` after the digest was sent so none is paged
twice; a send failure leaves them all unprocessed for the next tick (never silently
skipped). A single failure pages in the original per-event format; several become one
digest (count, total USD, distinct payers, top 3 reasons, first/last time, successes in
the same window, internal test-wallet share). More than BURST_THRESHOLD rows in one run
adds "BURST" to the first line. Per-event detail goes to stdout (the cron log).
"""
import datetime as _dt
import json
import subprocess
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "autopilot"))
from autopilot_common import tg_send  # noqa: E402

ROOT = "/home/apibase/apibase"
STATE = f"{ROOT}/scripts/night-orchestra/state"
BURST_THRESHOLD = 20
HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_DIR = os.environ.get("LEAK_ALERT_CONFIG_DIR", os.path.join(HERE, "..", "config", "autopilot"))


def load_internal_wallets():
    """Fail-closed loader for config/autopilot/internal-wallets.json (lowercase addresses)."""
    try:
        with open(os.path.join(CONFIG_DIR, "internal-wallets.json"), encoding="utf-8") as f:
            raw = json.load(f)
        assert isinstance(raw, list), "internal-wallets.json must be a JSON array"
    except (OSError, ValueError, AssertionError) as e:
        # A broken tag list must never silence the page itself: warn and page untagged.
        print(f"WARNING: internal-wallets.json unusable ({e}); paging without internal tags")
        return set()
    return {e["address"].lower() for e in raw if isinstance(e, dict) and isinstance(e.get("address"), str)}


def psql(sql):
    out = subprocess.run(
        ["docker", "exec", "apibase-postgres-1", "psql", "-U", os.environ.get("LEAK_ALERT_PSQL_USER", "apibase"), "-d", "apibase", "-tAF", "\x1f", "-c", sql],
        capture_output=True, text=True,
    )
    return out.stdout.strip(), out.returncode


def _amount(payload):
    try:
        return float(payload.get("amount_usd"))
    except (TypeError, ValueError):
        return 0.0


def parse_rows(rows_raw):
    """-> list of (row_id, created_at, payload dict)."""
    rows = []
    for line in rows_raw.splitlines():
        row_id, created_at, payload_raw = line.split("\x1f")
        try:
            payload = json.loads(payload_raw)
        except Exception:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        rows.append((row_id, created_at, payload))
    return rows


def build_message(rows, internal, successes=None):
    """Digest text for >= 1 rows. One row keeps the original single-event format."""
    if len(rows) == 1:
        row_id, created_at, payload = rows[0]
        tag = " [internal test traffic]" if str(payload.get("payer", "")).lower() in internal else ""
        return (
            f"[apibase] \U0001f6a8 x402 settle FAILED (revenue leak){tag} — client already got the "
            f"data.\ntool: {payload.get('tool_id', '?')}\namount: ${payload.get('amount_usd', '?')}\n"
            f"payer: {payload.get('payer', '?')}\nreason: {payload.get('reason', '?')}\n"
            f"outbox id: {row_id} @ {created_at}"
        )
    n = len(rows)
    total = sum(_amount(p) for _, _, p in rows)
    payers = {str(p.get("payer", "?")).lower() for _, _, p in rows}
    reasons = {}
    for _, _, p in rows:
        r = str(p.get("reason", "?"))
        reasons[r] = reasons.get(r, 0) + 1
    top = sorted(reasons.items(), key=lambda kv: (-kv[1], kv[0]))[:3]
    n_int = sum(1 for _, _, p in rows if str(p.get("payer", "")).lower() in internal)
    burst = " BURST" if n > BURST_THRESHOLD else ""
    lines = [
        f"[apibase] \U0001f6a8{burst} x402 settle FAILED x{n} (revenue leak) — clients already got the data.",
        f"total: ${total:.4f} | distinct payers: {len(payers)}",
        "top reasons: " + "; ".join(f"{r} x{c}" for r, c in top),
        f"first: {rows[0][1]} | last: {rows[-1][1]}",
        f"internal test traffic: {n_int} of {n}; real clients: {n - n_int}",
    ]
    if successes is not None:
        lines.append(f"settle successes in the same window: {successes}")
    return "\n".join(lines)


def main():
    # T-0428: read-only daily line; selection below is unchanged (x402_settle_failed only).
    pend_raw, pend_rc = psql(
        "SELECT count(*) FROM outbox WHERE event_type = 'x402_settle_pending' "
        "AND processed = false AND created_at < now() - interval '1 hour'"
    )
    # The script runs every 5 minutes; the pending line is emitted once a day (06:00-06:04 UTC).
    hm = _dt.datetime.utcnow().strftime('%H%M')
    if pend_rc == 0 and pend_raw and '0600' <= hm < '0605':
        print(f"x402-settle-leak-alerts: {pend_raw.strip()} settles pending > 1 h")

    # Dry-run replay: LEAK_ALERT_REPLAY="<from>,<to>" selects ALREADY-processed rows of that
    # window (only honoured together with LEAK_ALERT_DRY_RUN=1; nothing is sent or marked).
    replay = os.environ.get("LEAK_ALERT_REPLAY", "") if os.environ.get("LEAK_ALERT_DRY_RUN") == "1" else ""
    if replay:
        t_from, t_to = [x.strip().replace("'", "") for x in replay.split(",", 1)]
        where = f"processed = true AND created_at >= '{t_from}'::timestamptz AND created_at < '{t_to}'::timestamptz"
    else:
        where = "processed = false"
    rows_raw, rc = psql(
        f"""
        SELECT id, created_at, payload
        FROM outbox
        WHERE event_type = 'x402_settle_failed' AND {where}
        ORDER BY created_at
        """
    )
    if rc != 0:
        print("x402-settle-leak-alerts: psql query failed")
        return 1
    if not rows_raw:
        print("x402-settle-leak-alerts: 0 unalerted settle failures")
        return 0

    rows = parse_rows(rows_raw)
    for row_id, created_at, p in rows:  # per-event detail stays in the log
        print(f"event id={row_id} at={created_at} tool={p.get('tool_id', '?')} "
              f"amount={p.get('amount_usd', '?')} payer={p.get('payer', '?')} reason={p.get('reason', '?')}")

    successes = None
    if len(rows) > 1:
        out, src = psql(
            "SELECT count(*) FROM execution_ledger WHERE x402_onchain_settled = true "
            f"AND created_at >= '{rows[0][1]}'::timestamptz - interval '5 minutes' AND created_at <= '{rows[-1][1]}'::timestamptz + interval '5 minutes'"
        )
        if src == 0 and out.strip().isdigit():
            successes = int(out.strip())

    if os.environ.get("LEAK_ALERT_DRY_RUN") == "1":
        print(build_message(rows, load_internal_wallets(), successes))
        return 0

    sent = tg_send(build_message(rows, load_internal_wallets(), successes))
    if sent:
        ids_sql = ",".join(str(int(r[0])) for r in rows)
        _, rc2 = psql(f"UPDATE outbox SET processed = true WHERE id IN ({ids_sql})")
        if rc2 != 0:
            print(f"WARNING: alerted {len(rows)} but failed to mark processed — will re-alert next tick")
    else:
        print(f"FAILED to send digest for {len(rows)} rows — left unprocessed for next tick")
    print(f"x402-settle-leak-alerts: {len(rows)} unalerted, {len(rows) if sent else 0} paged in 1 message")
    return 0


if __name__ == "__main__":
    sys.exit(main())
