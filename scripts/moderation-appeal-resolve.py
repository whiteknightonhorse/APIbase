#!/usr/bin/env python3
"""moderation-appeal-resolve.py — mark one content-moderation appeal
resolved (F2/C-3).

Run by the operator (or by Claude on the operator's explicit instruction —
never on its own judgment: whether a block was correct is a human call, same
boundary as the standing MPP-refund decision) after reviewing an appeal.
This is the only thing that flips a moderation_appeals row's status away
from OPEN. Until this runs, the row stays visible as open past its 72h
response_due_at.

Usage:
  moderation-appeal-resolve.py <appeal_id> --uphold "<why the block stands>"
  moderation-appeal-resolve.py <appeal_id> --overturn "<why it was wrong; note any refund/credit issued manually>"
"""
import re
import subprocess
import sys

UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")


def sql_literal(value: str) -> str:
    """Quote a Python string as a SQL string literal (single quotes, doubled
    internally) — NOT json.dumps(), which produces double-quoted JSON syntax
    Postgres parses as an IDENTIFIER, not a string literal, and silently
    breaks the statement (this exact bug shipped once already, in
    mpp-refund-resolve.py — fixed there, not repeated here)."""
    return "'" + value.replace("'", "''") + "'"


def psql(sql: str):
    out = subprocess.run(
        [
            "docker", "exec", "apibase-postgres-1", "psql", "-U", "apibase", "-d", "apibase",
            "-tAF", "\x1f", "-c", sql,
        ],
        capture_output=True, text=True,
    )
    return out.stdout.rstrip("\n"), out.returncode


def usage():
    print(__doc__)
    raise SystemExit(2)


def selftest():
    assert sql_literal("plain") == "'plain'"
    assert sql_literal("it's") == "'it''s'"
    assert sql_literal("multi 'quote' test") == "'multi ''quote'' test'"
    assert UUID_RE.match("a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    assert not UUID_RE.match("not-a-uuid")
    print("moderation-appeal-resolve --selftest: OK")
    raise SystemExit(0)


if len(sys.argv) >= 2 and sys.argv[1] == "--selftest":
    selftest()

if len(sys.argv) < 4 or sys.argv[2] not in ("--uphold", "--overturn"):
    usage()

appeal_id = sys.argv[1]
if not UUID_RE.match(appeal_id):
    print(f"appeal_id must be a UUID, got: {appeal_id!r}")
    raise SystemExit(2)

mode = sys.argv[2]
note = sys.argv[3]
new_status = "UPHELD" if mode == "--uphold" else "OVERTURNED"

row, rc = psql(f"SELECT status, tool_id, category FROM moderation_appeals WHERE appeal_id = '{appeal_id}'::uuid")
if rc != 0:
    print("moderation-appeal-resolve: psql lookup failed")
    raise SystemExit(1)
if not row:
    print(f"moderation-appeal-resolve: no appeal with id {appeal_id}")
    raise SystemExit(1)

status, tool_id, category = row.split("\x1f")
if status != "OPEN":
    print(f"moderation-appeal-resolve: appeal {appeal_id} is already {status}, not touching it")
    raise SystemExit(1)

_, rc2 = psql(
    "UPDATE moderation_appeals SET status = " + sql_literal(new_status) +
    ", resolution_note = " + sql_literal(note) +
    ", resolved_at = NOW() WHERE appeal_id = '" + appeal_id + "'::uuid"
)
if rc2 != 0:
    print("moderation-appeal-resolve: UPDATE failed")
    raise SystemExit(1)

print(f"moderation-appeal-resolve: {appeal_id} ({tool_id}, {category}) -> {new_status}")
if new_status == "OVERTURNED":
    print("Reminder: OVERTURNED does not itself refund anything -- if a refund/credit")
    print("is owed, that is a separate manual step (same boundary as MPP refunds).")
