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
  moderation-appeal-resolve.py <appeal_id> --show
  moderation-appeal-resolve.py <appeal_id> --uphold "<why the block stands>"
  moderation-appeal-resolve.py <appeal_id> --overturn "<why it was wrong; note any refund/credit issued manually>"

--show prints the full record (rule/category/flagged field + content, if
still retained) so the operator can actually review what was blocked before
deciding -- one of the two access channels ШАГ 2 (2026-09-02) allows for the
matched content (the other is the appeal page itself, seen by the appellant
who already sent the content). Never logs, never posts to Telegram -- stdout
only, read by whoever runs this interactively.
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

if len(sys.argv) < 3 or sys.argv[2] not in ("--show", "--uphold", "--overturn"):
    usage()

appeal_id = sys.argv[1]
if not UUID_RE.match(appeal_id):
    print(f"appeal_id must be a UUID, got: {appeal_id!r}")
    raise SystemExit(2)

mode = sys.argv[2]

if mode == "--show":
    row, rc = psql(
        "SELECT status, tool_id, rule_id, category, matched_field, matched_content, "
        "content_truncated, match_start, match_end, content_expires_at, created_at "
        f"FROM moderation_appeals WHERE appeal_id = '{appeal_id}'::uuid"
    )
    if rc != 0:
        print("moderation-appeal-resolve: psql lookup failed")
        raise SystemExit(1)
    if not row:
        print(f"moderation-appeal-resolve: no appeal with id {appeal_id}")
        raise SystemExit(1)
    (status, tool_id, rule_id, category, matched_field, matched_content,
     content_truncated, match_start, match_end, content_expires_at, created_at) = row.split("\x1f")
    print(f"appeal_id:       {appeal_id}")
    print(f"status:          {status}")
    print(f"tool_id:         {tool_id}")
    print(f"rule_id:         {rule_id}")
    print(f"category:        {category}")
    print(f"created_at:      {created_at}")
    print(f"content_expires_at: {content_expires_at}")
    if category == "csam":
        print("matched_content: [never stored -- CSAM absolute exception]")
    elif not matched_content:
        print("matched_content: [none -- expired and wiped, or never captured]")
    else:
        print(f"matched_field:   {matched_field}")
        print(f"match offsets:   {match_start}-{match_end}"
              + (" (content truncated at 4KB)" if content_truncated == "t" else ""))
        print("matched_content:")
        print(matched_content)
    raise SystemExit(0)

if len(sys.argv) < 4:
    usage()

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

# ШАГ 2 retention: resolution is the point the real target (resolved_at+30d)
# becomes known -- set it here instead of leaving submitAppeal()'s generous
# pending-resolution interim in place indefinitely.
_, rc2 = psql(
    "UPDATE moderation_appeals SET status = " + sql_literal(new_status) +
    ", resolution_note = " + sql_literal(note) +
    ", resolved_at = NOW()"
    ", content_expires_at = NOW() + INTERVAL '30 days'"
    " WHERE appeal_id = '" + appeal_id + "'::uuid"
)
if rc2 != 0:
    print("moderation-appeal-resolve: UPDATE failed")
    raise SystemExit(1)

print(f"moderation-appeal-resolve: {appeal_id} ({tool_id}, {category}) -> {new_status}")
if new_status == "OVERTURNED":
    print("Reminder: OVERTURNED does not itself refund anything -- if a refund/credit")
    print("is owed, that is a separate manual step (same boundary as MPP refunds).")
