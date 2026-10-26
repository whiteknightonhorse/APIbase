#!/usr/bin/env python3
"""mpp-refund-weekly-summary.py — backstop for refunds owed (refund_ledger).

Operator ruling REFUND-WALLET-1026 (c), 2026-10-24: refunds are paid automatically by the
refund payout job (0553); until it runs, a debt can sit unpaid. A forgotten refund and a
quiet one are indistinguishable in the moment, and the 5-minute alert
(mpp-refund-owed-alerts.py) already told the operator once and moved on. This script is the
weekly reminder that a debt with no place to age still exists: count of `owed` refund_ledger
rows (internal wallets excluded), the oldest one's age, and the total amount outstanding.
Silent when there is nothing open (same zero-noise convention as the other night-orchestra
alert scripts).

Weekly cron (see crontab) — cheap enough to also run on demand.
"""
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
    return out.stdout.rstrip(chr(10)), out.returncode


row, rc = psql(
    """
    SELECT COUNT(*), COALESCE(SUM(amount_usd), 0), MIN(detected_at)
    FROM refund_ledger
    WHERE status = 'owed'
    """
)
if rc != 0:
    print("mpp-refund-weekly-summary: psql query failed")
    raise SystemExit(1)

count_raw, total_raw, oldest_raw = row.split("\x1f")
count = int(count_raw)

if count == 0:
    print("mpp-refund-weekly-summary: 0 refunds pending")
    raise SystemExit(0)

text = (
    f"[apibase] \U0001f4cb Weekly refund summary — {count} refund(s) still owed.\n"
    f"total outstanding: ${total_raw} USDC\n"
    f"oldest: {oldest_raw}\n"
    f"list them: scripts/refund-ledger.py list --status owed\n"
    f"close one without paying: scripts/refund-ledger.py cancel <refund_id> --reason \"<reason>\""
)

if not tg_send(text):
    print(f"mpp-refund-weekly-summary: {count} pending but Telegram send FAILED")
    raise SystemExit(1)

print(f"mpp-refund-weekly-summary: {count} pending, oldest {oldest_raw}, paged")
