#!/usr/bin/env python3
"""mpp-refund-owed-alerts.py — F1/C-5: page the operator for every MPP charge
that needs a manual refund because the provider call failed after payment.

WHY THIS PAGES A HUMAN INSTEAD OF SENDING THE REFUND ITSELF: sending
cryptocurrency autonomously is something this codebase's own author (Claude)
will not write, ever — not a business-logic choice, a standing safety rule.
MPP has no built-in refund/reverse primitive (checked node_modules/mppx — the
tempo `charge`/`session` methods have no counterpart), so a refund is a brand
new outbound on-chain transfer signed with the live operator key; that gets
built and reviewed by a human, not shipped blind. This script's job is only
to make sure the human finds out immediately and with the exact numbers,
instead of never, or three weeks later in a books reconciliation.

Same shape as x402-settle-leak-alerts.py: read unprocessed `mpp_refund_owed`
outbox rows, page Telegram via state/tg.env, mark processed on send success.
5-minute cron — this is real, already-collected money sitting unrefunded.
"""
import json
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
    return out.stdout.strip(), out.returncode


rows_raw, rc = psql(
    """
    SELECT id, created_at, payload
    FROM outbox
    WHERE event_type = 'mpp_refund_owed' AND processed = false
    ORDER BY created_at
    """
)
if rc != 0:
    print("mpp-refund-owed-alerts: psql query failed")
    raise SystemExit(1)

if not rows_raw:
    print("mpp-refund-owed-alerts: 0 unalerted refunds owed")
    raise SystemExit(0)

tg = load_tg_env()
token = tg.get("TG_BOT_TOKEN")
chat_id = tg.get("TG_CHAT_ID")

sent_ids = []
for line in rows_raw.splitlines():
    row_id, created_at, payload_raw = line.split("\x1f")
    try:
        payload = json.loads(payload_raw)
    except Exception:
        payload = {}

    payer = payload.get("payer", "?")
    unknown_payer_note = (
        "\n⚠️ payer address unresolved (RPC lookup failed at charge time) — "
        "look up the tx on-chain by request_id/timestamp before refunding."
        if payer in ("unknown-mpp-payer", "?", None)
        else ""
    )
    text = (
        f"[apibase] \U0001f4b8 MPP REFUND OWED (manual action needed) — provider call failed "
        f"after payment.\ntool: {payload.get('tool_id', '?')}\namount: ${payload.get('amount_usd', '?')} USDC\n"
        f"refund to: {payer}\nreason: {payload.get('reason', '?')}\n"
        f"outbox id: {row_id} @ {created_at}{unknown_payer_note}"
    )

    ok = False
    if token and chat_id:
        r = subprocess.run(
            ["curl", "-sS", "--max-time", "30", "-F", f"chat_id={chat_id}", "-F", f"text={text}",
             f"https://api.telegram.org/bot{token}/sendMessage"],
            capture_output=True, text=True,
        )
        ok = '"ok":true' in r.stdout
    if ok:
        sent_ids.append(row_id)
    else:
        print(f"FAILED to alert outbox id {row_id} — left unprocessed for next tick")

if sent_ids:
    ids_sql = ",".join(sent_ids)
    _, rc2 = psql(f"UPDATE outbox SET processed = true WHERE id IN ({ids_sql})")
    if rc2 != 0:
        print(f"WARNING: alerted {len(sent_ids)} but failed to mark processed — will re-alert next tick")

print(f"mpp-refund-owed-alerts: {len(rows_raw.splitlines())} unalerted, {len(sent_ids)} paged")
