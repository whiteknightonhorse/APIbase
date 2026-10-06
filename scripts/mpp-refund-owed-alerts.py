#!/usr/bin/env python3
# outbox-worker owns only HANDLED_EVENT_TYPES (src/outbox/processor.ts) and never marks this type
"""mpp-refund-owed-alerts.py — F1/C-5: tell the operator about MPP charges that
need a manual refund because the provider call failed after payment.

T-0280 (TG-POLICY-1006 / MPP-REFUND-OWED-FLOOD-1006 ruling-1): DIGEST mode
replaces the per-event pager. One message per day (first tick at or after
06:00Z) covers every not-yet-alerted row: count, sum, top-5 tools, top-5
payers, reason breakdown, and separate "internal (Heartbeat)" / "external"
lines. An immediate PAGE fires only for an EXTERNAL payer (not in
config/autopilot/internal-wallets.json) when: one row >= $1.00; or one wallet
sums >= $5.00 in 24h; or refund_to = unknown-mpp-payer with amount >= $0.10;
or >= 100 external rows in the last hour. Each page is deduped per key per UTC
day (state file). All Telegram text lives in config/autopilot/tg-strings.ru.json.
Run: no args = tick (pages + digest if due); --selftest = pure-logic checks.

WHY THIS TELLS A HUMAN INSTEAD OF SENDING THE REFUND ITSELF: sending
cryptocurrency autonomously is something this codebase's own author (Claude)
will not write, ever — not a business-logic choice, a standing safety rule,
confirmed by the operator as a standing decision on 2026-09-01: MPP refunds
are sent MANUALLY, by hand, after the alert. MPP has no built-in
refund/reverse primitive (checked node_modules/mppx — the tempo
`charge`/`session` methods have no counterpart), so a refund is a brand new
outbound on-chain transfer signed with the live operator key.

`processed` means "still owed" and stays false until a human explicitly closes
it via mpp-refund-resolve.py (which also keeps the row safe from
partition-cleanup.job.ts's 7-day outbox retention — that job already refuses
to drop any partition with an unprocessed row). Rows from our own wallets
(internal-wallets.json) are written processed=true by recordMppRefundOwed
(escrow-finalize.stage.ts): kept as a free QA report, never a debt.
This script marks `alerted_at` in the payload (not `processed`);
mpp-refund-weekly-summary.py is the backstop that keeps a slow-to-resolve
refund visible.
"""
import json
import os
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

ROOT = "/home/apibase/apibase"
STATE = f"{ROOT}/scripts/night-orchestra/state"
HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_DIR = os.environ.get("MPP_DIGEST_CONFIG_DIR", os.path.join(HERE, "..", "config", "autopilot"))
DIGEST_STATE = os.environ.get("MPP_DIGEST_STATE", f"{STATE}/mpp-refund-digest.json")

DIGEST_HOUR_UTC = 6
PAGE_ROW_USD = Decimal("1.00")
PAGE_WALLET_24H_USD = Decimal("5.00")
PAGE_UNKNOWN_PAYER_USD = Decimal("0.10")
PAGE_EXT_ROWS_PER_HOUR = 100
# Operator decision 2026-10-06 (option b): sub-cent external debt accumulates per wallet and is
# refunded in ONE transfer once the wallet sum >= $0.05 or the oldest open row is >= 7 days old.
DUE_WALLET_USD = Decimal("0.05")
DUE_OLDEST_DAYS = 7
UNKNOWN_PAYERS = ("unknown-mpp-payer", "?", "")


def load_tg_strings():
    """Fail-closed: a missing/malformed file raises (same contract as autopilot_common)."""
    with open(os.path.join(CONFIG_DIR, "tg-strings.ru.json"), encoding="utf-8") as f:
        raw = json.load(f)
    assert isinstance(raw, dict) and all(isinstance(v, str) for v in raw.values()), \
        "tg-strings.ru.json must be a flat JSON object of strings"
    return raw


def load_internal_wallets():
    """Fail-closed loader for config/autopilot/internal-wallets.json (lowercase addresses)."""
    with open(os.path.join(CONFIG_DIR, "internal-wallets.json"), encoding="utf-8") as f:
        raw = json.load(f)
    assert isinstance(raw, list), "internal-wallets.json must be a JSON array"
    out = set()
    for e in raw:
        assert isinstance(e, dict) and isinstance(e.get("address"), str) \
            and e["address"] == e["address"].lower() and e["address"].startswith("0x"), \
            f"internal-wallets.json: bad entry {e!r}"
        out.add(e["address"])
    return out


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


def send_tg(text):
    tg = load_tg_env()
    token = tg.get("TG_BOT_TOKEN")
    chat_id = tg.get("TG_CHAT_ID")
    if not (token and chat_id):
        return False
    r = subprocess.run(
        ["curl", "-sS", "--max-time", "30", "-F", f"chat_id={chat_id}", "-F", f"text={text}",
         f"https://api.telegram.org/bot{token}/sendMessage"],
        capture_output=True, text=True,
    )
    return '"ok":true' in r.stdout


def usd(payload):
    try:
        return Decimal(str(payload.get("amount_usd")))
    except (InvalidOperation, TypeError):
        return Decimal(0)


def payer_of(payload):
    return payload.get("refund_to") or payload.get("payer") or "?"


def is_internal(row, internal):
    p = row["payload"]
    return p.get("internal_wallet") is True or str(payer_of(p)).lower() in internal


def fmt(d):
    return f"{d:.4f}".rstrip("0").rstrip(".") if d else "0"


def top(counter, n=5):
    return ", ".join(f"{k} ({v})" for k, v in counter.most_common(n)) or "-"


def total_usd(rows):
    return sum((usd(r["payload"]) for r in rows), Decimal(0))


def due_wallets(open_rows, internal, now):
    """Pure. open_rows: unresolved rows (processed=false). Returns [(payer, total, n, oldest_days)]
    for external wallets whose accumulated debt is >= DUE_WALLET_USD or whose oldest row is
    >= DUE_OLDEST_DAYS old, biggest first."""
    acc = {}
    for r in open_rows:
        if is_internal(r, internal):
            continue
        w = str(payer_of(r["payload"])).lower()
        a = acc.setdefault(w, [Decimal(0), 0, r["created_at"]])
        a[0] += usd(r["payload"])
        a[1] += 1
        a[2] = min(a[2], r["created_at"])
    out = [(w, t, n, (now - o).days) for w, (t, n, o) in acc.items()
           if t >= DUE_WALLET_USD or (now - o).days >= DUE_OLDEST_DAYS]
    return sorted(out, key=lambda x: x[1], reverse=True)


def render_due(due, tg):
    if not due:
        return ""
    lines = "\n".join(tg["mpp_digest_due_line"].format(payer=w, total=fmt(t), n=n, days=d)
                      for w, t, n, d in due[:10])
    return tg["mpp_digest_due_head"].format(count=len(due)) + "\n" + lines


def fetch_open_rows():
    """All unresolved rows (processed=false) regardless of alerted_at."""
    raw, rc = psql(
        """
        SELECT json_build_object('id', id,
                 'created_at', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"'),
                 'alerted', payload->>'alerted_at' IS NOT NULL, 'payload', payload)
        FROM outbox WHERE event_type = 'mpp_refund_owed' AND processed = false
        """
    )
    if rc != 0:
        return None
    rows = []
    for line in raw.splitlines():
        r = json.loads(line)
        r["created_at"] = datetime.fromisoformat(r["created_at"])
        rows.append(r)
    return rows


def build_digest(rows, internal, tg, due=()):
    ext = [r for r in rows if not is_internal(r, internal)]
    ints = [r for r in rows if is_internal(r, internal)]
    tools = Counter(r["payload"].get("tool_id", "?") for r in rows)
    payers = Counter(str(payer_of(r["payload"])) for r in rows)
    reasons = Counter(str(r["payload"].get("reason", "?")) for r in rows)
    text = tg["mpp_digest"].format(
        n=len(rows), total=fmt(total_usd(rows)),
        tools=top(tools), payers=top(payers), reasons=top(reasons),
        int_n=len(ints), int_usd=fmt(total_usd(ints)),
        ext_n=len(ext), ext_usd=fmt(total_usd(ext)),
    )
    extra = render_due(list(due), tg)
    return text + ("\n" + extra if extra else "")


def find_pages(rows, internal, now):
    """Pure. rows: dicts {id, created_at (tz-aware datetime), alerted, payload}. Returns
    [(dedupe_key, kind, data, row_ids_to_mark_alerted)] for EXTERNAL payers only."""
    ext = [r for r in rows if not is_internal(r, internal)]
    day = now.strftime("%Y-%m-%d")
    pages = []
    for r in ext:
        if r["alerted"]:
            continue
        amt, payer = usd(r["payload"]), str(payer_of(r["payload"]))
        if amt >= PAGE_ROW_USD or (payer in UNKNOWN_PAYERS and amt >= PAGE_UNKNOWN_PAYER_USD):
            pages.append((f"row:{r['id']}", "row", r, [r["id"]]))
    by_wallet = defaultdict(lambda: [Decimal(0), 0])
    for r in ext:
        w = str(payer_of(r["payload"])).lower()
        if w in UNKNOWN_PAYERS or (now - r["created_at"]).total_seconds() > 86400:
            continue
        by_wallet[w][0] += usd(r["payload"])
        by_wallet[w][1] += 1
    for w, (total, n) in by_wallet.items():
        if total >= PAGE_WALLET_24H_USD:
            pages.append((f"wallet:{w}:{day}", "wallet", {"payer": w, "total": total, "n": n}, []))
    last_hour = [r for r in ext if (now - r["created_at"]).total_seconds() <= 3600]
    if len(last_hour) >= PAGE_EXT_ROWS_PER_HOUR:
        tools = Counter(r["payload"].get("tool_id", "?") for r in last_hour)
        pages.append((f"rate:{day}", "rate", {"n": len(last_hour), "tools": top(tools)}, []))
    return pages


def render_page(kind, data, tg):
    if kind == "row":
        p = data["payload"]
        payer = str(payer_of(p))
        return tg["mpp_page_row"].format(
            tool=p.get("tool_id", "?"), amount=p.get("amount_usd", "?"), network=p.get("network", "tempo"),
            payer=payer, tx=p.get("tx_hash", "unknown"), request_id=p.get("request_id", "?"),
            reason=p.get("reason", "?"), row_id=data["id"], created_at=data["created_at"].isoformat(),
            note=tg["mpp_page_unknown_note"] if payer in UNKNOWN_PAYERS else "")
    if kind == "wallet":
        return tg["mpp_page_wallet"].format(payer=data["payer"], total=fmt(data["total"]), n=data["n"],
                                            limit=fmt(PAGE_WALLET_24H_USD))
    return tg["mpp_page_rate"].format(n=data["n"], limit=PAGE_EXT_ROWS_PER_HOUR, tools=data["tools"])


def digest_due(now, state):
    return now.hour >= DIGEST_HOUR_UTC and state.get("digest_date") != now.strftime("%Y-%m-%d")


def load_state():
    try:
        with open(DIGEST_STATE) as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state):
    tmp = DIGEST_STATE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, DIGEST_STATE)


def mark_alerted(ids):
    ids = [int(i) for i in ids]
    if not ids:
        return 0
    _, rc = psql(
        "UPDATE outbox SET payload = payload || jsonb_build_object('alerted_at', now()::text) "
        f"WHERE event_type = 'mpp_refund_owed' AND id IN ({','.join(str(i) for i in ids)})"
    )
    return rc


def fetch_rows():
    """Rows that matter: never alerted (any processed state — internal rows are processed=true
    but still belong in the digest) or created within the last 24h (wallet/rate pages)."""
    raw, rc = psql(
        """
        SELECT json_build_object('id', id,
                 'created_at', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"'),
                 'alerted', payload->>'alerted_at' IS NOT NULL, 'payload', payload)
        FROM outbox
        WHERE event_type = 'mpp_refund_owed'
          AND (payload->>'alerted_at' IS NULL OR created_at > now() - interval '24 hours')
        ORDER BY created_at
        """
    )
    if rc != 0:
        return None
    rows = []
    for line in raw.splitlines():
        r = json.loads(line)
        r["created_at"] = datetime.fromisoformat(r["created_at"])
        rows.append(r)
    return rows


def tick():
    tg, internal = load_tg_strings(), load_internal_wallets()
    rows = fetch_rows()
    if rows is None:
        print("mpp-refund-owed-alerts: query failed")
        return 1
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    state = load_state()
    sent_keys = {k: v for k, v in state.get("page_keys", {}).items() if v == today}
    paged = 0
    for key, kind, data, mark_ids in find_pages(rows, internal, now):
        if key in sent_keys:
            continue
        if not send_tg(render_page(kind, data, tg)):
            print(f"FAILED to page {key}")
            continue
        sent_keys[key] = today
        paged += 1
        if mark_ids and mark_alerted(mark_ids) != 0:
            print(f"WARNING: paged {key} but failed to mark alerted_at")
        for r in rows:
            if r["id"] in mark_ids:
                r["alerted"] = True
    state["page_keys"] = sent_keys
    digested = 0
    if digest_due(now, state):
        pending = [r for r in rows if not r["alerted"]]
        due = due_wallets(fetch_open_rows() or [], internal, now)
        if (pending or due) and send_tg(build_digest(pending, internal, tg, due)):
            if mark_alerted([r["id"] for r in pending]) != 0:
                print("WARNING: digest sent but failed to mark alerted_at — rows re-appear in the next digest")
            state["digest_date"] = today
            digested = len(pending)
        elif pending or due:
            print("FAILED to send digest — retry next tick")
    save_state(state)
    print(f"mpp-refund-owed-alerts: {paged} paged, {digested} rows in digest")
    return 0


def selftest():
    tg = load_tg_strings()
    wallets = load_internal_wallets()
    assert len(wallets) == 14, "internal-wallets.json must hold the 14 Heartbeat addresses"
    internal = {"0x" + "a" * 40}
    now = datetime(2026, 10, 7, 6, 30, tzinfo=timezone.utc)

    def row(i, amt, payer="0x" + "b" * 40, age_s=60, alerted=False, **extra):
        return {"id": i, "created_at": datetime.fromtimestamp(now.timestamp() - age_s, timezone.utc),
                "alerted": alerted, "payload": {"amount_usd": amt, "refund_to": payer, "tool_id": "t.x",
                                                "reason": "r", **extra}}

    def kinds(rows):
        return sorted(k for _, k, _, _ in find_pages(rows, internal, now))

    assert kinds([row(1, 0.002)]) == [], "small external row must not page"
    assert kinds([row(1, 1.0)]) == ["row"], "row >= $1 pages"
    assert kinds([row(1, 0.999)]) == []
    assert kinds([row(1, 0.1, payer="unknown-mpp-payer")]) == ["row"], "unknown payer >= $0.10 pages"
    assert kinds([row(1, 0.09, payer="unknown-mpp-payer")]) == []
    assert kinds([row(1, 5.0, payer="0x" + "a" * 40)]) == [], "internal wallet never pages"
    assert kinds([row(1, 5.0, internal_wallet=True)]) == [], "internal_wallet flag never pages"
    assert kinds([row(i, 0.6, alerted=True) for i in range(9)]) == ["wallet"], "24h wallet sum >= $5 pages"
    assert kinds([row(i, 0.6, age_s=90000, alerted=True) for i in range(9)]) == [], "outside 24h ignored"
    assert kinds([row(i, 0.0001, payer=f"0x{i:040x}", alerted=True) for i in range(100)]) == ["rate"]
    assert kinds([row(i, 0.0001, payer=f"0x{i:040x}", alerted=True) for i in range(99)]) == []
    assert kinds([row(1, 2.0, alerted=True)]) == [], "already-alerted row does not re-page"
    assert digest_due(now, {}) and not digest_due(now, {"digest_date": "2026-10-07"})
    assert not digest_due(now.replace(hour=5), {})
    text = build_digest([row(1, 0.5), row(2, 0.25, payer="0x" + "a" * 40)], internal, tg)
    assert "internal (Heartbeat): 1 / $0.25" in text and "external: 1 / $0.5" in text, text
    ow = [row(1, 0.03, payer="0x" + "c" * 40), row(2, 0.03, payer="0x" + "c" * 40),
          row(3, 0.001, payer="0x" + "d" * 40), row(4, 0.04, payer="0x" + "e" * 40),
          row(5, 0.001, payer="0x" + "f" * 40, age_s=8 * 86400), row(6, 9.0, payer="0x" + "a" * 40)]
    got = {w[-1]: t for w, t, _, _ in due_wallets(ow, internal, now)}
    assert set(got) == {"c", "f"}, f"due wallets: {got}"  # c: 0.06 sum, f: 8 days old; d/e below both
    assert "0.06" in build_digest([row(1, 0.5)], internal, tg, due_wallets(ow, internal, now))
    for kind, data in (("row", row(7, 1.5)), ("wallet", {"payer": "0x1", "total": Decimal(6), "n": 3}),
                       ("rate", {"n": 100, "tools": "t.x (100)"})):
        render_page(kind, data, tg)
    print("selftest ok")
    return 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else tick())
