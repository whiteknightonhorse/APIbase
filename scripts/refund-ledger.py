#!/usr/bin/env python3
"""refund-ledger.py -- operator CLI for the refund_ledger table (T-0551).

Operator ruling REFUND-WALLET-1026 (c), 2026-10-24: refunds are paid automatically by the
refund payout job (0553) from a dedicated operator-funded refund wallet. This tool never
sends anything. It reads the ledger and has ONE write verb: `cancel` (a debt that is not
owed after all). It replaces mpp-refund-resolve.py.

Usage:
  refund-ledger.py list [--rail base|tempo] [--status owed|internal|scheduled|sent|cancelled]
  refund-ledger.py cancel <refund_id> --reason "<why no refund is owed>"
  refund-ledger.py status
  refund-ledger.py --selftest
"""
import re
import subprocess
import sys

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
RAILS = ("base", "tempo")
STATUSES = ("owed", "internal", "scheduled", "sent", "cancelled")
SEP = "\x1f"


def sql_literal(value):
    """Quote a Python string as a SQL string literal (single quotes, doubled internally)."""
    return "'" + value.replace("'", "''") + "'"


def run_sql(sql):
    out = subprocess.run(
        ["docker", "exec", "apibase-postgres-1", "psql", "-U", "apibase", "-d", "apibase",
         "-tAF", SEP, "-c", sql],
        capture_output=True, text=True,
    )
    return out.stdout.rstrip("\n"), out.returncode


def parse_args(argv):
    """Pure. Returns (verb, options) or raises ValueError with a usage message."""
    if not argv:
        raise ValueError("missing verb")
    verb, rest = argv[0], argv[1:]
    opts = {}
    if verb == "list":
        i = 0
        while i < len(rest):
            if rest[i] in ("--rail", "--status") and i + 1 < len(rest):
                opts[rest[i][2:]] = rest[i + 1]
                i += 2
            else:
                raise ValueError(f"unexpected argument {rest[i]!r}")
        if opts.get("rail", "base") not in RAILS:
            raise ValueError("--rail must be base or tempo")
        if opts.get("status", "owed") not in STATUSES:
            raise ValueError("--status must be one of " + ", ".join(STATUSES))
    elif verb == "cancel":
        if len(rest) != 3 or rest[1] != "--reason" or not rest[2].strip():
            raise ValueError('cancel <refund_id> --reason "<text>"')
        if not UUID_RE.match(rest[0]):
            raise ValueError(f"refund_id must be a uuid, got {rest[0]!r}")
        opts = {"refund_id": rest[0], "reason": rest[2]}
    elif verb == "status":
        if rest:
            raise ValueError("status takes no arguments")
    else:
        raise ValueError(f"unknown verb {verb!r}")
    return verb, opts


def list_sql(opts):
    where = []
    if "rail" in opts:
        where.append(f"rail = {sql_literal(opts['rail'])}")
    if "status" in opts:
        where.append(f"status = {sql_literal(opts['status'])}")
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    return (
        "SELECT refund_id, rail, status, amount_usd, reason, payer, "
        "to_char(detected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), "
        f"coalesce(original_tx, '-'), coalesce(refund_tx, '-') FROM refund_ledger {clause} "
        "ORDER BY detected_at LIMIT 500"
    )


def cancel_sql(opts):
    return (
        "UPDATE refund_ledger SET status = 'cancelled', "
        f"cancelled_reason = {sql_literal(opts['reason'])} "
        f"WHERE refund_id = {sql_literal(opts['refund_id'])}::uuid AND status IN ('owed', 'internal')"
    )


STATUS_SQL = (
    "SELECT rail, count(*), coalesce(sum(amount_usd), 0), "
    "coalesce(to_char(min(detected_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), '-') "
    "FROM refund_ledger WHERE status = 'owed' GROUP BY rail ORDER BY rail"
)
CARRIED_SQL = (
    "SELECT count(*) FROM refund_ledger WHERE status = 'owed' "
    "AND detected_at < now() - interval '14 days'"
)


def main(argv):
    try:
        verb, opts = parse_args(argv)
    except ValueError as e:
        print(f"refund-ledger: {e}\n\n{__doc__}")
        return 2
    if verb == "list":
        out, rc = run_sql(list_sql(opts))
        if rc != 0:
            print("refund-ledger: query failed")
            return 1
        print(out.replace(SEP, "\t") if out else "(no rows)")
        return 0
    if verb == "cancel":
        out, rc = run_sql(cancel_sql(opts))
        if rc != 0 or out != "UPDATE 1":
            print(f"refund-ledger: cancel failed ({out!r}) -- only owed/internal rows can be cancelled")
            return 1
        print(f"refund-ledger: {opts['refund_id']} cancelled ({opts['reason']})")
        return 0
    out, rc = run_sql(STATUS_SQL)
    carried, rc2 = run_sql(CARRIED_SQL)
    if rc != 0 or rc2 != 0:
        print("refund-ledger: query failed")
        return 1
    if not out:
        print("owed: 0 rows, $0 (no external debt)")
    for line in out.splitlines():
        rail, n, total, oldest = line.split(SEP)
        print(f"owed {rail}: {n} rows, ${total}, oldest detected_at {oldest}")
    print(f"carried (owed > 14 days): {carried}")
    return 0


def selftest():
    assert sql_literal("it's") == "'it''s'"
    assert parse_args(["list"]) == ("list", {})
    assert parse_args(["list", "--rail", "tempo", "--status", "sent"])[1] == {"rail": "tempo", "status": "sent"}
    for bad in (["list", "--rail", "eth"], ["list", "--status", "x"], ["cancel"], ["status", "x"], ["nope"],
                ["cancel", "not-a-uuid", "--reason", "r"],
                ["cancel", "00000000-0000-0000-0000-000000000000", "--reason", " "]):
        try:
            parse_args(bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted {bad}")
    _, o = parse_args(["cancel", "00000000-0000-0000-0000-000000000000", "--reason", "o'k"])
    assert "'o''k'" in cancel_sql(o) and "IN ('owed', 'internal')" in cancel_sql(o)
    assert "rail = 'tempo'" in list_sql({"rail": "tempo"})
    print("refund-ledger --selftest: OK")
    return 0


if __name__ == "__main__":
    sys.exit(selftest() if sys.argv[1:] == ["--selftest"] else main(sys.argv[1:]))
