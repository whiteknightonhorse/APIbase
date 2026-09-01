#!/usr/bin/env python3
"""mpp-refund-owed-alerts.py — F1/C-5: page the operator for every MPP charge
that needs a manual refund because the provider call failed after payment.

WHY THIS PAGES A HUMAN INSTEAD OF SENDING THE REFUND ITSELF: sending
cryptocurrency autonomously is something this codebase's own author (Claude)
will not write, ever — not a business-logic choice, a standing safety rule,
confirmed by the operator as a standing decision on 2026-09-01: MPP refunds
are sent MANUALLY, by hand, after this alert. MPP has no built-in
refund/reverse primitive (checked node_modules/mppx — the tempo
`charge`/`session` methods have no counterpart), so a refund is a brand new
outbound on-chain transfer signed with the live operator key; that is a human
action this alert exists to trigger promptly, with everything needed to act
on it without further digging: amount, recipient (=original payer), network,
the original tx hash, the call id, and when it happened.

2026-09-01: this used to mark `processed = true` right after a SUCCESSFUL
PAGE — conflating "the operator was told" with "the debt is closed". A
forgotten refund and an actually-resolved one looked identical in the
database, which is worse than an outright failure because we implied it was
handled. Now: `processed` means "still owed" and stays false until a human
explicitly closes it via mpp-refund-resolve.py (which also keeps the row
safe from partition-cleanup.job.ts's 7-day outbox retention — that job
already refuses to drop any partition with an unprocessed row). This script
only alerts once per row (marks `alerted_at` in the payload, not
`processed`) so an unresolved refund doesn't repage every 5 minutes forever;
mpp-refund-weekly-summary.py is the backstop that keeps a slow-to-resolve
refund visible instead of it aging out of anyone's attention.
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


# Only rows never alerted yet — processed stays false until a human resolves
# it (mpp-refund-resolve.py), so this query must NOT re-select an already
# paged-but-still-open refund every tick.
rows_raw, rc = psql(
    """
    SELECT id, created_at, payload
    FROM outbox
    WHERE event_type = 'mpp_refund_owed'
      AND processed = false
      AND payload->>'alerted_at' IS NULL
    ORDER BY created_at
    """
)
if rc != 0:
    print("mpp-refund-owed-alerts: psql query failed")
    raise SystemExit(1)

if not rows_raw:
    print("mpp-refund-owed-alerts: 0 new refunds owed")
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

    payer = payload.get("refund_to") or payload.get("payer", "?")
    unknown_payer_note = (
        "\n⚠️ payer address unresolved (RPC lookup failed at charge time) — "
        "look up the tx on-chain by request_id/timestamp before refunding."
        if payer in ("unknown-mpp-payer", "?", None)
        else ""
    )
    text = (
        f"[apibase] \U0001f4b8 MPP REFUND OWED (manual action needed) — provider call failed "
        f"after payment.\n"
        f"tool: {payload.get('tool_id', '?')}\n"
        f"amount: ${payload.get('amount_usd', '?')} USDC\n"
        f"network: {payload.get('network', 'tempo')}\n"
        f"refund to: {payer}\n"
        f"original tx: {payload.get('tx_hash', 'unknown')}\n"
        f"call id (request_id): {payload.get('request_id', '?')}\n"
        f"reason: {payload.get('reason', '?')}\n"
        f"outbox id: {row_id} @ {created_at}{unknown_payer_note}\n"
        f"When sent, close it: mpp-refund-resolve.py {row_id} --sent \"<tx hash of your refund>\""
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
        print(f"FAILED to alert outbox id {row_id} — left un-alerted for next tick")

if sent_ids:
    ids_sql = ",".join(sent_ids)
    # Mark ALERTED, not processed/resolved — the debt stays open (processed=false)
    # until mpp-refund-resolve.py is run by hand.
    _, rc2 = psql(
        f"UPDATE outbox SET payload = payload || jsonb_build_object('alerted_at', now()::text) "
        f"WHERE id IN ({ids_sql})"
    )
    if rc2 != 0:
        print(f"WARNING: alerted {len(sent_ids)} but failed to mark alerted_at — will re-alert next tick")

print(f"mpp-refund-owed-alerts: {len(rows_raw.splitlines())} new, {len(sent_ids)} paged")
