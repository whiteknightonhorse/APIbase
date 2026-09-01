#!/usr/bin/env python3
"""mpp-refund-weekly-summary.py — backstop for manual MPP refunds.

Refunds are resolved by hand (operator decision, 2026-09-01) — which means a
refund can be forgotten. A forgotten refund and a genuinely-resolved one are
indistinguishable in the moment, and forgetting is worse than an outright
failure because the 5-minute alert (mpp-refund-owed-alerts.py) already told
the operator once and moved on. This script is the weekly reminder that a
debt with no place to age still exists: count of still-open
(`processed = false`) `mpp_refund_owed` rows, the oldest one's age, and the
total amount outstanding. Silent when there is nothing open (same
zero-noise convention as the other night-orchestra alert scripts).

Weekly cron (see crontab) — cheap enough to also run on demand.
"""
import subprocess
import os

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


def psql(sql):
    out = subprocess.run(
        ["docker", "exec", "apibase-postgres-1", "psql", "-U", "apibase", "-d", "apibase", "-tAF", "\x1f", "-c", sql],
        capture_output=True, text=True,
    )
    return out.stdout.rstrip(chr(10)), out.returncode


row, rc = psql(
    """
    SELECT COUNT(*), COALESCE(SUM((payload->>'amount_usd')::numeric), 0), MIN(created_at)
    FROM outbox
    WHERE event_type = 'mpp_refund_owed' AND processed = false
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

tg = load_tg_env()
token = tg.get("TG_BOT_TOKEN")
chat_id = tg.get("TG_CHAT_ID")

text = (
    f"[apibase] \U0001f4cb Weekly MPP refund summary — {count} refund(s) still waiting "
    f"on your hand.\n"
    f"total outstanding: ${total_raw} USDC\n"
    f"oldest: {oldest_raw}\n"
    f"list them: SELECT id, created_at, payload FROM outbox WHERE event_type='mpp_refund_owed' "
    f"AND processed=false ORDER BY created_at;\n"
    f"close one: mpp-refund-resolve.py <id> --sent \"<tx hash>\" (or --cancel \"<reason>\")"
)

if token and chat_id:
    r = subprocess.run(
        ["curl", "-sS", "--max-time", "30", "-F", f"chat_id={chat_id}", "-F", f"text={text}",
         f"https://api.telegram.org/bot{token}/sendMessage"],
        capture_output=True, text=True,
    )
    ok = '"ok":true' in r.stdout
    if not ok:
        print(f"mpp-refund-weekly-summary: {count} pending but Telegram send FAILED")
        raise SystemExit(1)

print(f"mpp-refund-weekly-summary: {count} pending, oldest {oldest_raw}, paged")
