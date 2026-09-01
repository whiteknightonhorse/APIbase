#!/usr/bin/env python3
"""mpp-refund-resolve.py — mark one MPP refund-owed outbox row closed.

Run by hand (or by Claude on the operator's explicit instruction — never on
its own judgment) after the operator has ACTUALLY sent the manual refund, or
has decided no refund is owed and why. This is the only thing that flips
`processed` to true for a `mpp_refund_owed` row — see the standing-decision
comment in escrow-finalize.stage.ts. Until this runs, the row stays visible
to mpp-refund-owed-alerts.py's tracking query and to
mpp-refund-weekly-summary.py, and stays protected from
partition-cleanup.job.ts's 7-day outbox retention.

Usage:
  mpp-refund-resolve.py <outbox_id> --sent "<refund tx hash or note>"
  mpp-refund-resolve.py <outbox_id> --cancel "<reason no refund is owed>"
"""
import subprocess
import sys
import json
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
    return out.stdout.strip(), out.returncode


def usage():
    print(__doc__)
    raise SystemExit(2)


if len(sys.argv) < 4 or sys.argv[2] not in ("--sent", "--cancel"):
    usage()

outbox_id = sys.argv[1]
if not outbox_id.isdigit():
    print(f"outbox_id must be numeric, got: {outbox_id!r}")
    raise SystemExit(2)

mode = sys.argv[2]
detail = sys.argv[3]
resolution = "sent_manually" if mode == "--sent" else "cancelled"

# Confirm the row exists, is the right event type, and is still open —
# refuse silently-wrong ids instead of updating zero rows without a trace.
row_raw, rc = psql(
    f"SELECT payload FROM outbox WHERE id = {int(outbox_id)} "
    f"AND event_type = 'mpp_refund_owed'"
)
if rc != 0:
    print("mpp-refund-resolve: psql lookup failed")
    raise SystemExit(1)
if not row_raw:
    print(f"mpp-refund-resolve: no mpp_refund_owed row with id {outbox_id}")
    raise SystemExit(1)

already_raw, rc2 = psql(
    f"SELECT processed FROM outbox WHERE id = {int(outbox_id)} AND event_type = 'mpp_refund_owed'"
)
if already_raw.strip() == "t":
    print(f"mpp-refund-resolve: outbox id {outbox_id} is already resolved — no-op")
    raise SystemExit(0)

update_sql = (
    f"UPDATE outbox SET processed = true, "
    f"payload = payload || jsonb_build_object("
    f"'resolution', {json.dumps(resolution)}, "
    f"'resolution_detail', {json.dumps(detail)}, "
    f"'resolved_at', now()::text) "
    f"WHERE id = {int(outbox_id)} AND event_type = 'mpp_refund_owed'"
)
_, rc3 = psql(update_sql)
if rc3 != 0:
    print("mpp-refund-resolve: UPDATE failed — refund is still tracked as open")
    raise SystemExit(1)

print(f"mpp-refund-resolve: outbox id {outbox_id} marked {resolution} ({detail})")

tg = load_tg_env()
token = tg.get("TG_BOT_TOKEN")
chat_id = tg.get("TG_CHAT_ID")
if token and chat_id:
    verb = "REFUND SENT" if mode == "--sent" else "REFUND CANCELLED"
    text = f"[apibase] ✅ MPP {verb} — outbox id {outbox_id}: {detail}"
    subprocess.run(
        ["curl", "-sS", "--max-time", "30", "-F", f"chat_id={chat_id}", "-F", f"text={text}",
         f"https://api.telegram.org/bot{token}/sendMessage"],
        capture_output=True, text=True,
    )
