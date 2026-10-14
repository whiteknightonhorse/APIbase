#!/usr/bin/env python3
# outbox-worker owns only HANDLED_EVENT_TYPES (src/outbox/processor.ts) and never marks these types
"""inbound-messages-alerts.py — T-SITE-D: page the operator on Telegram for every inbound
web message ('form_submission' from /onboard, 'contact_message' from /contact).

Same pattern as x402-settle-leak-alerts.py: host script, `docker exec ... psql`, state/tg.env.
`outbox.processed = true` here means "paged". A send failure leaves the row for the next tick.
No automated reply e-mail — the reply is the operator's. Once a day a nag lists stale items
(onboarding pending > 7 days, contact messages 'new' > 3 days).

Usage: inbound-messages-alerts.py [--selftest]
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

ROOT = "/home/apibase/apibase"
STATE = f"{ROOT}/scripts/night-orchestra/state"
NAG_FILE = f"{STATE}/inbound-nag.date"
ONBOARD_STALE_DAYS = 7
CONTACT_STALE_DAYS = 3


def clip(s, n):
    s = " ".join(str(s or "").split())
    return s if len(s) <= n else s[:n] + "..."


def format_contact(msg_id, name, email, message):
    return f"[apibase] contact {msg_id} from {clip(name, 100)} {clip(email, 200)}: {clip(message, 400)}"


def format_onboarding(sub_id, company, category, api_url, email, description):
    return (
        f"[apibase] onboarding {sub_id}: {clip(company, 200)} | {clip(category, 100)} | "
        f"{clip(api_url, 300)} | {clip(email, 200)} | {clip(description, 300)} "
        f"— decide: scripts/onboard-review.py accept|reject {sub_id}"
    )


def select_stale(onboarding, contacts, now):
    """onboarding: [(id, created_at)] pending; contacts: [(id, created_at)] status 'new'.
    created_at are aware datetimes. Returns (stale_onboarding_ids, stale_contact_ids)."""
    ob = [i for i, t in onboarding if (now - t).total_seconds() > ONBOARD_STALE_DAYS * 86400]
    ct = [i for i, t in contacts if (now - t).total_seconds() > CONTACT_STALE_DAYS * 86400]
    return ob, ct


def format_nag(ob_ids, ct_ids):
    parts = []
    if ob_ids:
        parts.append(f"onboarding pending > {ONBOARD_STALE_DAYS} days ({len(ob_ids)}): " + ", ".join(ob_ids))
    if ct_ids:
        parts.append(f"contact messages new > {CONTACT_STALE_DAYS} days ({len(ct_ids)}): " + ", ".join(ct_ids))
    return ("[apibase] inbound messages awaiting a reply — " + "; ".join(parts)) if parts else ""


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
        ["docker", "exec", "apibase-postgres-1", "psql", "-U", "apibase", "-d", "apibase", "-tA", "-c", sql],
        capture_output=True, text=True,
    )
    return out.stdout.strip(), out.returncode


def send(tg, text):
    token, chat_id = tg.get("TG_BOT_TOKEN"), tg.get("TG_CHAT_ID")
    if not (token and chat_id):
        return False
    r = subprocess.run(
        ["curl", "-sS", "--max-time", "30", "-F", f"chat_id={chat_id}", "-F", f"text={text}",
         f"https://api.telegram.org/bot{token}/sendMessage"],
        capture_output=True, text=True,
    )
    return '"ok":true' in r.stdout


def json_rows(sql):
    """One row_to_json per line (JSON escapes newlines, so free text cannot split a row)."""
    out, rc = psql(sql)
    if rc != 0:
        return None
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def lit(v):
    return "'" + str(v or "").replace("'", "''") + "'"


def page_new():
    rows = json_rows(
        "SELECT row_to_json(t) FROM (SELECT id, event_type, payload->>'submission_id' AS sid, "
        "payload->>'message_id' AS mid FROM outbox "
        "WHERE event_type IN ('form_submission','contact_message') AND processed = false ORDER BY created_at) t"
    )
    if rows is None:
        print("inbound-messages-alerts: psql query failed")
        return 1
    tg = load_tg_env()
    sent = []
    for r in rows:
        text = None
        if r["event_type"] == "contact_message":
            src = json_rows(
                "SELECT row_to_json(t) FROM (SELECT name, email, message FROM contact_messages "
                f"WHERE message_id = {lit(r['mid'])}) t"
            )
            if src:
                text = format_contact(r["mid"], src[0]["name"], src[0]["email"], src[0]["message"])
        else:
            src = json_rows(
                "SELECT row_to_json(t) FROM (SELECT company_name, category, api_url, contact_email, description "
                f"FROM onboarding_submissions WHERE submission_id = {lit(r['sid'])}) t"
            )
            if src:
                s = src[0]
                text = format_onboarding(
                    r["sid"], s["company_name"], s["category"], s["api_url"], s["contact_email"], s["description"]
                )
        if text is None:
            print(f"outbox id {r['id']}: source row missing — left unprocessed")
            continue
        if send(tg, text):
            sent.append(str(int(r["id"])))
        else:
            print(f"FAILED to page outbox id {r['id']} — left unprocessed for next tick")
    if sent:
        _, rc = psql(f"UPDATE outbox SET processed = true WHERE id IN ({','.join(sent)})")
        if rc != 0:
            print(f"WARNING: paged {len(sent)} but failed to mark processed — will re-page next tick")
    print(f"inbound-messages-alerts: {len(rows)} unpaged, {len(sent)} paged")
    return 0


def nag_once_a_day():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        if open(NAG_FILE).read().strip() == today:
            return
    except OSError:
        pass
    ob = json_rows(
        "SELECT row_to_json(t) FROM (SELECT submission_id AS id, created_at FROM onboarding_submissions "
        "WHERE status = 'pending') t"
    )
    ct = json_rows(
        "SELECT row_to_json(t) FROM (SELECT message_id AS id, created_at FROM contact_messages "
        "WHERE status = 'new') t"
    )
    if ob is None or ct is None:
        return

    def parse(rs):
        return [(r["id"], datetime.fromisoformat(r["created_at"])) for r in rs]

    ob_ids, ct_ids = select_stale(parse(ob), parse(ct), datetime.now(timezone.utc))
    text = format_nag(ob_ids, ct_ids)
    if text and not send(load_tg_env(), text):
        print("FAILED to send nag — will retry next tick")
        return
    with open(NAG_FILE, "w") as f:
        f.write(today + "\n")


def selftest():
    c = format_contact("m1", "Ann", "a@x.io", "x" * 500)
    assert c.startswith("[apibase] contact m1 from Ann a@x.io: ") and len(c.split(": ", 1)[1]) == 403, c
    o = format_onboarding("s1", "Acme", "travel", "https://a.io", "a@x.io", "d" * 400)
    assert o.startswith("[apibase] onboarding s1: Acme | travel | https://a.io | a@x.io | ")
    assert o.endswith("— decide: scripts/onboard-review.py accept|reject s1") and "d" * 301 not in o
    assert "\n" not in format_contact("m", "n", "e", "a\nb")
    now = datetime(2026, 10, 14, tzinfo=timezone.utc)

    def ago(n):
        return datetime(2026, 10, 14 - n, tzinfo=timezone.utc)

    assert select_stale([("a", ago(8)), ("b", ago(6))], [("c", ago(4)), ("d", ago(2))], now) == (["a"], ["c"])
    assert format_nag([], []) == "" and "a" in format_nag(["a"], ["c"])
    print("inbound-messages-alerts selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        raise SystemExit(0)
    code = page_new()
    if code == 0:
        nag_once_a_day()
    raise SystemExit(code)
