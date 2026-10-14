#!/usr/bin/env python3
"""onboard-review.py — T-SITE-D: operator review of /onboard submissions (host script).

  onboard-review.py list
  onboard-review.py accept <id> --note "..."
  onboard-review.py reject <id> --note "..."
  onboard-review.py --selftest

Writes status + moderation_result = {decision, note, by:"operator", at}. Refuses a non-pending id.
"""
import json
import subprocess
import sys
from datetime import datetime, timezone

STATUS = {"accept": "accepted", "reject": "rejected"}


def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def moderation_json(decision, note, now):
    return json.dumps({"decision": decision, "note": note, "by": "operator", "at": now.strftime("%Y-%m-%dT%H:%M:%SZ")})


def build_update(decision, sub_id, note, now):
    return (
        f"UPDATE onboarding_submissions SET status = {sql_str(STATUS[decision])}, "
        f"moderation_result = {sql_str(moderation_json(decision, note, now))}::jsonb "
        f"WHERE submission_id = {sql_str(sub_id)} AND status = 'pending' RETURNING submission_id"
    )


LIST_SQL = (
    "SELECT submission_id, created_at::date, company_name, category, api_url, contact_email "
    "FROM onboarding_submissions WHERE status = 'pending' ORDER BY created_at"
)


def psql(sql):
    r = subprocess.run(
        ["docker", "exec", "apibase-postgres-1", "psql", "-U", "apibase", "-d", "apibase", "-tA", "-F", " | ", "-c", sql],
        capture_output=True, text=True,
    )
    return r.stdout.strip(), r.returncode, r.stderr.strip()


def selftest():
    now = datetime(2026, 10, 14, 12, 0, 0, tzinfo=timezone.utc)
    m = json.loads(moderation_json("accept", "it's ok", now))
    assert m == {"decision": "accept", "note": "it's ok", "by": "operator", "at": "2026-10-14T12:00:00Z"}
    q = build_update("reject", "s'1", "no", now)
    assert "status = 'rejected'" in q and "'s''1'" in q and "AND status = 'pending'" in q
    assert "status = 'accepted'" in build_update("accept", "s1", "", now)
    print("onboard-review selftest OK")


def main(argv):
    if "--selftest" in argv:
        selftest()
        return 0
    if argv and argv[0] == "list":
        out, rc, err = psql(LIST_SQL)
        print((out or "no pending submissions") if rc == 0 else err)
        return rc
    if len(argv) >= 2 and argv[0] in STATUS:
        note = argv[argv.index("--note") + 1] if "--note" in argv and argv.index("--note") + 1 < len(argv) else ""
        out, rc, err = psql(build_update(argv[0], argv[1], note, datetime.now(timezone.utc)))
        if rc != 0:
            print(err)
            return rc
        if not out.startswith(argv[1]):
            print(f"refused: {argv[1]} is not a pending submission")
            return 1
        print(f"{argv[1]} -> {STATUS[argv[0]]}")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
