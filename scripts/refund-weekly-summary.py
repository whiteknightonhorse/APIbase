#!/usr/bin/env python3
"""refund-weekly-summary.py - Monday 09:00 UTC Telegram summary of the refund ledger and wallets
(T-0556, REFUND-WALLET-1026 ruling-1). Replaces mpp-refund-weekly-summary.py. Read-only.

Covers: the last payout run (outbox `refund_payout_run`), owed per rail, rows carried forward
(owed rows detected before the last run) with the oldest age, wallet balances vs ceiling/low
(GET /health/refund-wallet), kill state, and the internal (Heartbeat) row count as the QA line.
Always sends (a quiet week is information too). Run: no args; --selftest = pure logic.
"""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import refund_common as rc  # noqa: E402


def describe_run(run, none_text):
    """Pure. run: payload of the latest refund_payout_run event or None."""
    if not isinstance(run, dict):
        return none_text
    head = f"{run.get('at', '?')}"
    if run.get("skipped"):
        return f"{head} skipped ({run['skipped']})"
    parts = []
    for rail, r in sorted((run.get("rails") or {}).items()):
        if isinstance(r, dict):
            note = f", {r['note']}" if r.get("note") else ""
            parts.append(f"{rail}: {r.get('paid', 0)}/{r.get('payers', 0)} paid, ${rc.fmt(r.get('usd'))}{note}")
    mode = " (dry run)" if run.get("dry_run") else ""
    return f"{head}{mode} " + ("; ".join(parts) or "no rails")


def describe_balances(h, none_text):
    """Pure. h: /health/refund-wallet payload or None."""
    if not isinstance(h, dict):
        return none_text
    out = []
    for rail in ("base", "tempo"):
        w = h.get(rail)
        if not isinstance(w, dict):
            continue
        bal = w.get("balance_usd")
        if bal is None:
            out.append(f"{rail} n/a")
            continue
        flag = " OVER CEILING" if rc.dec(bal) > rc.dec(w.get("ceiling_usd")) else (
            " LOW" if rc.dec(bal) < rc.dec(w.get("low_usd")) else "")
        out.append(f"{rail} ${rc.fmt(bal)} (ceiling ${rc.fmt(w.get('ceiling_usd'))}, low ${rc.fmt(w.get('low_usd'))}){flag}")
    return "; ".join(out) or none_text


def render(tg, run, owed, carried_n, oldest_days, h, killed, internal_n):
    owed_txt = ", ".join(f"{r}: ${rc.fmt(v)}" for r, v in sorted(owed.items())) or "0"
    return tg["refund_weekly"].format(
        run=describe_run(run, tg["refund_weekly_none"]), owed=owed_txt, carried=carried_n,
        oldest_days=oldest_days, balances=describe_balances(h, tg["refund_weekly_none"]),
        kill="ON" if killed else "off", internal_n=internal_n)


def collect():
    run = None
    out, code = rc.sql("SELECT payload::text FROM outbox WHERE event_type = 'refund_payout_run' ORDER BY id DESC LIMIT 1")
    if code != 0:
        return None
    if out:
        run = json.loads(out)
    out, code = rc.sql("SELECT rail, COALESCE(SUM(amount_usd),0) FROM refund_ledger WHERE status = 'owed' GROUP BY rail")
    if code != 0:
        return None
    owed = {}
    for line in out.splitlines():
        rail, total = line.split("\x1f")
        owed[rail] = rc.dec(total)
    since = "'-infinity'"
    if isinstance(run, dict) and run.get("at"):
        since = "'" + str(run["at"]).replace("'", "")[:40] + "'"
    out, code = rc.sql(
        "SELECT COUNT(*), COALESCE(EXTRACT(DAY FROM now() - MIN(detected_at))::int, 0) FROM refund_ledger "
        f"WHERE status = 'owed' AND detected_at < {since}::timestamptz")
    if code != 0:
        return None
    carried_n, oldest = (int(x) for x in out.split("\x1f"))
    out, code = rc.sql("SELECT COUNT(*) FROM refund_ledger WHERE status = 'internal' AND detected_at > now() - interval '7 days'")
    if code != 0:
        return None
    return run, owed, carried_n, oldest, int(out or 0)


def main():
    tg = rc.load_tg_strings()
    got = collect()
    if got is None:
        print("refund-weekly-summary: query failed")
        return 1
    run, owed, carried_n, oldest, internal_n = got
    text = render(tg, run, owed, carried_n, oldest, rc.health(), rc.kill_active(), internal_n)
    if not rc.tg_send(text):
        print("refund-weekly-summary: Telegram send FAILED")
        return 1
    print(f"refund-weekly-summary: sent at {datetime.now(timezone.utc).isoformat()}")
    return 0


def selftest():
    tg = rc.load_tg_strings()
    assert describe_run(None, "none") == "none"
    run = {"at": "2026-11-03T07:00:00Z", "dry_run": False, "rails": {"base": {"payers": 2, "usd": 1.5, "paid": 2},
                                                                     "tempo": {"payers": 1, "usd": 0.2, "paid": 0, "note": "error"}}}
    d = describe_run(run, "none")
    assert "base: 2/2 paid, $1.5" in d and "tempo: 0/1 paid" in d and "error" in d, d
    assert "skipped (kill switch)" in describe_run({"at": "t", "skipped": "kill switch", "rails": {}}, "none")
    h = {"base": {"balance_usd": 150, "ceiling_usd": 100, "low_usd": 10},
         "tempo": {"balance_usd": 5, "ceiling_usd": 100, "low_usd": 10}}
    b = describe_balances(h, "none")
    assert "OVER CEILING" in b and "LOW" in b, b
    assert "n/a" in describe_balances({"base": {"balance_usd": None}}, "none")
    assert describe_balances(None, "none") == "none"
    text = render(tg, run, {"base": rc.dec("1.5")}, 3, 12, h, True, 7)
    assert "base: $1.5" in text and "ON" in text and "12" in text and "7" in text, text
    print("selftest ok")
    return 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else main())
