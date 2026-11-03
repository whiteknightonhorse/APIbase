#!/usr/bin/env python3
# outbox-worker never touches refund_alert rows: this script owns that event type and sets processed=true when it has paged
"""refund-alerts.py - Telegram pages for the refund ledger and the refund wallets (T-0556,
REFUND-WALLET-1026 ruling-1). Replaces mpp-refund-owed-alerts.py. Scheduled every 5 minutes.

1. Reads unprocessed outbox `refund_alert` events (written by the payout job, T-0553) and pages by
   kind, deduped per key per UTC day (state file): wallet low, wallet over ceiling, payout
   failed/expired, payer over cap, kill switch, run skipped (fee oracle out of band).
   recipient mismatch and key mismatch are CRITICAL and never deduped. Then marks the event processed.
2. mpp_settle_unknown / mpp_settle_unmatched outbox events: paged once each (carried over).
   Kill file present: one page per UTC day while it exists.
3. Debt side, from refund_ledger rows with status owed (external only; internal rows have their
   own status and are a QA line in the weekly summary): one row >= $1.00 (once per row), one
   wallet >= $5.00 in 24 h, >= 100 rows in the last hour.
Telegram text lives in config/autopilot/tg-strings.ru.json (refund_* keys).
Run: no args = tick; --selftest = pure-logic checks (no DB, no network).
"""
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import refund_common as rc  # noqa: E402

STATE_FILE = os.environ.get("REFUND_ALERTS_STATE", os.path.join(rc.STATE_DIR, "refund-alerts.json"))
PAGE_ROW_USD = Decimal("1.00")
PAGE_WALLET_24H_USD = Decimal("5.00")
PAGE_EXT_ROWS_PER_HOUR = 100

# event kind -> (tg key, dedup?)
EVENT_KINDS = {
    "refund_wallet_low": ("refund_ev_wallet_low", True),
    "refund_wallet_over_ceiling": ("refund_ev_over_ceiling", True),
    "refund_payout_failed": ("refund_ev_payout_failed", True),
    "refund_payout_expired": ("refund_ev_payout_expired", True),
    "refund_recipient_mismatch": ("refund_ev_recipient_mismatch", False),
    "refund_wallet_key_mismatch": ("refund_ev_key_mismatch", False),
    "refund_payer_over_cap": ("refund_ev_payer_over_cap", True),
    "refund_kill_switch": ("refund_ev_kill_active", True),
    "refund_kill_active": ("refund_ev_kill_active", True),
    "refund_fee_unavailable": ("refund_ev_run_skipped", True),
    "refund_run_skipped": ("refund_ev_run_skipped", True),
}


def event_page(kind, payload, tg):
    """Pure. Returns (dedupe_key or None, text). None key = never deduped."""
    tgkey, dedup = EVENT_KINDS.get(kind, ("refund_ev_other", True))
    p = payload if isinstance(payload, dict) else {}
    rail = str(p.get("rail", "-"))
    if tgkey == "refund_ev_kill_active":
        key, rail = "kill_active", "-"  # one kill page per day however it was detected
    else:
        key = f"{kind}:{rail}:{p.get('payer', '')}:{p.get('payout_id', '')}"
    text = tg[tgkey].format(
        rail=rail, kind=kind, payer=p.get("payer", "?"), payout_id=p.get("payout_id", "?"),
        reason=p.get("reason", "?"), balance=rc.fmt(p.get("balance_usd")), due=rc.fmt(p.get("due_usd")),
        ceiling=rc.fmt(p.get("ceiling_usd")), amount=rc.fmt(p.get("amount_usd")),
        detail=json.dumps(p, sort_keys=True)[:300])
    return (key if dedup else None), text


def debt_pages(rows, paged_rows, now):
    """Pure. rows: dicts {id, created_at (aware), payer, amount, tool, ...} of OWED external rows.
    paged_rows: ids already paged. Returns [(dedupe_key, kind, data)]."""
    day = rc.utc_day(now)
    pages = []
    for r in rows:
        if r["id"] not in paged_rows and r["amount"] >= PAGE_ROW_USD:
            pages.append((f"row:{r['id']}", "row", r))
    by_wallet = defaultdict(lambda: [Decimal(0), 0])
    for r in rows:
        if (now - r["created_at"]).total_seconds() > 86400:
            continue
        w = str(r["payer"]).lower()
        by_wallet[w][0] += r["amount"]
        by_wallet[w][1] += 1
    for w, (total, n) in sorted(by_wallet.items()):
        if total >= PAGE_WALLET_24H_USD:
            pages.append((f"wallet:{w}:{day}", "wallet", {"payer": w, "total": total, "n": n}))
    last_hour = [r for r in rows if (now - r["created_at"]).total_seconds() <= 3600]
    if len(last_hour) >= PAGE_EXT_ROWS_PER_HOUR:
        tools = ", ".join(f"{k} ({v})" for k, v in Counter(str(r.get("tool")) for r in last_hour).most_common(5))
        pages.append((f"rate:{day}", "rate", {"n": len(last_hour), "tools": tools}))
    return pages


def render_debt(kind, data, tg):
    if kind == "row":
        return tg["refund_page_row"].format(
            amount=rc.fmt(data["amount"]), network=data.get("rail", "?"), payer=data["payer"],
            tool=data.get("tool", "?"), reason=data.get("reason", "?"), tx=data.get("tx", "unknown"),
            row_id=data["id"], created_at=data["created_at"].isoformat())
    if kind == "wallet":
        return tg["refund_page_wallet"].format(payer=data["payer"], total=rc.fmt(data["total"]),
                                               n=data["n"], limit=rc.fmt(PAGE_WALLET_24H_USD))
    return tg["refund_page_rate"].format(n=data["n"], limit=PAGE_EXT_ROWS_PER_HOUR, tools=data["tools"])


def should_send(key, sent, day):
    """Pure dedup: key None = always; else once per UTC day. sent maps key -> day."""
    return key is None or sent.get(key) != day


def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, STATE_FILE)


def fetch_events():
    raw, code = rc.sql("SELECT json_build_object('id', id, 'payload', payload) FROM outbox "
                       "WHERE event_type = 'refund_alert' AND processed = false ORDER BY id LIMIT 200")
    if code != 0:
        return None
    return [json.loads(line) for line in raw.splitlines() if line.strip()]


def fetch_owed():
    raw, code = rc.sql(
        "SELECT json_build_object('id', refund_id::text, 'created_at', "
        "to_char(detected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"+00:00\"'), 'payer', payer, "
        "'amount', amount_usd, 'rail', rail, 'tool', note->>'tool_id', 'reason', reason, "
        "'tx', coalesce(original_tx, 'unknown')) FROM refund_ledger WHERE status = 'owed'")
    if code != 0:
        return None
    rows = []
    for line in raw.splitlines():
        if line.strip():
            r = json.loads(line)
            r["created_at"] = datetime.fromisoformat(r["created_at"])
            r["amount"] = rc.dec(r["amount"])
            rows.append(r)
    return rows


def fetch_settle_events():
    """mpp_settle_unknown / mpp_settle_unmatched outbox events not yet paged (payload.alerted_at).
    Carried over from mpp-refund-owed-alerts.py: nobody else pages them. They are NOT marked processed
    (an operator resolves them); alerted_at only stops the repeat page."""
    raw, code = rc.sql("SELECT json_build_object('id', id, 'kind', event_type, 'payload', payload) FROM outbox "
                       "WHERE event_type IN ('mpp_settle_unknown', 'mpp_settle_unmatched') "
                       "AND processed = false AND payload->>'alerted_at' IS NULL ORDER BY id LIMIT 50")
    return None if code != 0 else [json.loads(x) for x in raw.splitlines() if x.strip()]


def settle_page(ev, tg):
    """Pure."""
    p = ev["payload"] if isinstance(ev["payload"], dict) else {}
    return tg["refund_ev_settle_unknown"].format(
        kind=ev["kind"], tool=p.get("tool_id", "?"), amount=rc.fmt(p.get("amount_usd", p.get("amount"))),
        payer=p.get("refund_to") or p.get("payer") or "?", tx=p.get("tx_hash", "unknown"), event_id=ev["id"])


def mark_settle_alerted(ids):
    return rc.sql("UPDATE outbox SET payload = payload || jsonb_build_object('alerted_at', now()::text) "
                  f"WHERE id IN ({','.join(str(int(i)) for i in ids)})")[1]


def mark_processed(ids):
    if not ids:
        return 0
    return rc.sql(f"UPDATE outbox SET processed = true WHERE event_type = 'refund_alert' "
                  f"AND id IN ({','.join(str(int(i)) for i in ids)})")[1]


def tick():
    tg = rc.load_tg_strings()
    now = datetime.now(timezone.utc)
    day = rc.utc_day(now)
    state = load_state()
    sent = {k: v for k, v in state.get("page_keys", {}).items() if v == day}
    paged_rows = set(state.get("paged_rows", []))
    paged = 0
    events = fetch_events()
    if events is None:
        print("refund-alerts: event query failed")
        return 1
    done = []
    for ev in events:
        p = ev["payload"] if isinstance(ev["payload"], dict) else {}
        key, text = event_page(str(p.get("kind", "?")), p, tg)
        if not should_send(key, sent, day):
            done.append(ev["id"])
            continue
        if not rc.tg_send(text):
            print(f"FAILED to page event {ev['id']}; left unprocessed")
            continue
        if key:
            sent[key] = day
        paged += 1
        done.append(ev["id"])
    if mark_processed(done) != 0:
        print("WARNING: failed to mark events processed; they re-evaluate next tick (dedup holds)")
    settle = fetch_settle_events() or []
    paged_settle = []
    for ev in settle:
        if rc.tg_send(settle_page(ev, tg)):
            paged_settle.append(ev["id"])
            paged += 1
    if paged_settle and mark_settle_alerted(paged_settle) != 0:
        print("WARNING: settle events paged but alerted_at not stored; they page again next tick")
    if rc.kill_active():
        key, text = event_page("refund_kill_active", {}, tg)
        if should_send(key, sent, day) and rc.tg_send(text):
            sent[key] = day
            paged += 1
    rows = fetch_owed()
    if rows is None:
        print("refund-alerts: ledger query failed")
    else:
        wallets = rc.load_internal_wallets()
        rows = [r for r in rows if str(r["payer"]).lower() not in wallets]
        for key, kind, data in debt_pages(rows, paged_rows, now):
            if not should_send(key, sent, day):
                continue
            if not rc.tg_send(render_debt(kind, data, tg)):
                print(f"FAILED to page {key}")
                continue
            sent[key] = day
            paged += 1
            if kind == "row":
                paged_rows.add(data["id"])
        paged_rows &= {r["id"] for r in rows}  # forget rows that are no longer owed
    state["page_keys"], state["paged_rows"] = sent, sorted(paged_rows)
    save_state(state)
    print(f"refund-alerts: {paged} paged, {len(done)} events processed")
    return 0


def selftest():
    tg = rc.load_tg_strings()
    now = datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)
    day = rc.utc_day(now)

    def row(i, amt, payer="0x" + "b" * 40, age_s=60):
        return {"id": str(i), "created_at": now - timedelta(seconds=age_s), "payer": payer,
                "amount": Decimal(str(amt)), "tool": "t.x", "rail": "base", "reason": "r"}

    def kinds(rows, paged=()):
        return sorted(k for _, k, _ in debt_pages(rows, set(paged), now))

    assert kinds([row(1, 0.99)]) == [] and kinds([row(1, 1.0)]) == ["row"], "row threshold is >= $1.00"
    assert kinds([row(1, 1.0)], paged=["1"]) == [], "a paged row does not page again"
    assert kinds([row(i, 0.6) for i in range(9)]) == ["wallet"], "24 h wallet sum >= $5.00"
    assert kinds([row(i, 0.5) for i in range(9)]) == [], "4.50 is below the wallet threshold"
    assert kinds([row(i, 0.6, age_s=90000) for i in range(9)]) == [], "older than 24 h is ignored"
    assert kinds([row(i, 0.0001, payer=f"0x{i:040x}") for i in range(100)]) == ["rate"], "100 rows/hour"
    assert kinds([row(i, 0.0001, payer=f"0x{i:040x}") for i in range(99)]) == []
    assert kinds([row(i, 0.0001, payer=f"0x{i:040x}", age_s=4000) for i in range(100)]) == [], "rate window is 1 h"
    # dedup: per key per UTC day; critical kinds never deduped
    k1, _ = event_page("refund_wallet_low", {"rail": "base", "balance_usd": 1, "due_usd": 5}, tg)
    assert k1 and should_send(k1, {}, day) and not should_send(k1, {k1: day}, day)
    assert should_send(k1, {k1: "2026-11-02"}, day), "a new UTC day pages again"
    k2, _ = event_page("refund_wallet_low", {"rail": "tempo"}, tg)
    assert k2 != k1, "rails dedup separately"
    kc, text = event_page("refund_recipient_mismatch", {"rail": "base", "payout_id": "p1"}, tg)
    assert kc is None and should_send(kc, {"x": day}, day), "CRITICAL is never deduped"
    assert event_page("refund_wallet_key_mismatch", {"rail": "base", "reason": "x"}, tg)[0] is None
    assert event_page("refund_kill_switch", {"rail": "base"}, tg)[0] == event_page("refund_kill_active", {}, tg)[0]
    assert event_page("refund_fee_unavailable", {"rail": "tempo", "reason": "oracle"}, tg)[0]
    for kind in list(EVENT_KINDS) + ["refund_run_error"]:
        event_page(kind, {"rail": "base", "payer": "0x1", "payout_id": "p", "amount_usd": 3}, tg)
    assert "7" in settle_page({"id": 7, "kind": "mpp_settle_unknown", "payload": {"amount_usd": 0.5}}, tg)
    settle_page({"id": 8, "kind": "mpp_settle_unmatched", "payload": "x"}, tg)
    event_page("refund_alert_unknown", "not-a-dict", tg)
    for kind, data in (("row", row(7, 1.5)), ("wallet", {"payer": "0x1", "total": Decimal(6), "n": 3}),
                       ("rate", {"n": 100, "tools": "t.x (100)"})):
        render_debt(kind, data, tg)
    print("selftest ok")
    return 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else tick())
