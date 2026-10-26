#!/usr/bin/env python3
# outbox-worker owns only HANDLED_EVENT_TYPES (src/outbox/processor.ts) and never marks this type
"""x402-settle-leak-alerts.py — F1/C-7: page on every 'x402_settle_failed' outbox
event that hasn't been alerted yet.

Unlike margin-gate-alerts.py / provider-limit-alerts.py (GitHub issues — housekeeping-
paced), a settle failure means a client ALREADY got paid-for data for free, right now,
real money — so this pages Telegram directly (state/tg.env, same bot/chat every other
night-orchestra alert uses) rather than filing an issue someone reads tomorrow. Runs
every 5 minutes (see crontab), not hourly.

Idempotent: marks each row `processed=true` after a successful send so it is never
paged twice; a send failure leaves it unprocessed for the next tick.
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


def psql(sql):
    out = subprocess.run(
        ["docker", "exec", "apibase-postgres-1", "psql", "-U", "apibase", "-d", "apibase", "-tAF", "\x1f", "-c", sql],
        capture_output=True, text=True,
    )
    return out.stdout.strip(), out.returncode


# T-0428: read-only daily line; selection below is unchanged (x402_settle_failed only).
pend_raw, pend_rc = psql(
    "SELECT count(*) FROM outbox WHERE event_type = 'x402_settle_pending' "
    "AND processed = false AND created_at < now() - interval '1 hour'"
)
# The script runs every 5 minutes; the pending line is emitted once a day (06:00-06:04 UTC).
if pend_rc == 0 and pend_raw and _dt.datetime.utcnow().strftime('%H%M') < '0605' and _dt.datetime.utcnow().strftime('%H%M') >= '0600':
    print(f"x402-settle-leak-alerts: {pend_raw.strip()} settles pending > 1 h")

rows_raw, rc = psql(
    """
    SELECT id, created_at, payload
    FROM outbox
    WHERE event_type = 'x402_settle_failed' AND processed = false
    ORDER BY created_at
    """
)
if rc != 0:
    print("x402-settle-leak-alerts: psql query failed")
    raise SystemExit(1)

if not rows_raw:
    print("x402-settle-leak-alerts: 0 unalerted settle failures")
    raise SystemExit(0)

sent_ids = []
for line in rows_raw.splitlines():
    row_id, created_at, payload_raw = line.split("\x1f")
    try:
        payload = json.loads(payload_raw)
    except Exception:
        payload = {}

    text = (
        f"[apibase] \U0001f6a8 x402 settle FAILED (revenue leak) — client already got the "
        f"data.\ntool: {payload.get('tool_id', '?')}\namount: ${payload.get('amount_usd', '?')}\n"
        f"payer: {payload.get('payer', '?')}\nreason: {payload.get('reason', '?')}\n"
        f"outbox id: {row_id} @ {created_at}"
    )

    if tg_send(text):
        sent_ids.append(row_id)
    else:
        print(f"FAILED to alert outbox id {row_id} — left unprocessed for next tick")

if sent_ids:
    ids_sql = ",".join(sent_ids)
    _, rc2 = psql(f"UPDATE outbox SET processed = true WHERE id IN ({ids_sql})")
    if rc2 != 0:
        print(f"WARNING: alerted {len(sent_ids)} but failed to mark processed — will re-alert next tick")

print(f"x402-settle-leak-alerts: {len(rows_raw.splitlines())} unalerted, {len(sent_ids)} paged")
