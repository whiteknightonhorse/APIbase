#!/usr/bin/env python3
"""email-status-export.py — SG-21a (SG-21 ruling-1 §2/§4): apibase's half of
the cross-tenant Gmail-status picture sales (SG-21b) needs to label INBOX
mail with `Флот/*` labels. Same shape as scripts/fleet-touches-export.py
(SG-04): a READ-ONLY export apibase writes, sales reads — never a second
writer into the mailbox. apibase does not touch Gmail at all, ever; this
script's only output is a JSON file.

Boundary (SG-21 ruling-1 §2, explicit): "email-intake.py не менять... apibase
добавляет рядом с apibase-touches.json файл ... отдельным скриптом по своей
БД email_events, не правкой интейка." This file never imports or edits
scripts/autopilot/email-intake.py; it only reads the email_events TABLE that
script writes, via the same docker-exec-psql helper (autopilot_common.psql)
every other autopilot script in this repo already uses.

Class -> status mapping (the DECISIONS table SG-21a's acceptance requires;
also recorded in AUTOPILOT-PROGRESS.md#T-0186-SG-21a-apibase-email-status-export).
apibase has no dedicated DECISIONS.md file (sales has its own, separate
one); AUTOPILOT-PROGRESS.md's "DECISIONS" heading in that section is the
stand-in apibase uses instead, stated here explicitly rather than left
implicit. The mapping is a literal table below, not re-derived at runtime
from CLASS_TO_KIND +
routing.json — email-intake.py's CLASS_TO_KIND lives in a hyphenated
filename (not importable as a module without importlib gymnastics) and the
class enum changes rarely enough that mirroring it as a literal, like
autopilot_common.py/email-intake.py already mirror migration 0009/0022's own
CHECK constraints as literal Python sets, is the established convention in
this codebase, not a new one. CLASS_STATUS_MAP's own selftest asserts it
covers every class in EMAIL_CLASSES so the two can't silently drift apart.

  - PARTNER_REPLY -> needs_operator (SG-21 ruling-1 §1: "apibase по экспорту:
    статус needs_operator -> Ждёт вас + apibase"). ref is the PARTNER-*.md
    filename email-intake.py's own write_partner_reply_operator_files()
    already writes to ap.OPERATOR_DIR — same digest formula
    (sha256(msg_id)[:6]) reproduced read-only here, never guessed, and
    verified against the file actually on disk (never claim a ref that
    doesn't exist — see partner_reply_ref()).
  - HUMAN_KEY kinds (KEY_EXPIRES->CREDENTIAL_EXPIRED, KEY_REVOKED->AUTH_FAILED)
    and HUMAN_ONLY kinds (PAYMENT_FAILED/PRICING_CHANGE->PAYMENT_REQUIRED),
    per config/autopilot/routing.json -> needs_operator ("оплата, ключ,
    действие по аккаунту" — ruling-1's own three examples, literally these
    three routing.json route_classes).
  - AUTO/MIXED kinds that route.json has the ENGINE close itself
    (DEPRECATION/SUNSET/ENDPOINT_CHANGE/MAINTENANCE/SECURITY_CHANGE/
    ACCOUNT_ACTION/LIMIT_CHANGE -> EMAIL_NOTICE, AUTO; QUOTA -> QUOTA_LOW,
    MIXED) -> handled ("классы, по которым инцидент закрывает автопилот сам").
  - MARKETING -> handled (ruling-1 §2, explicit).
  - UNMATCHED, DEFERRED_BUDGET -> never exported (ruling-1 §2, explicit:
    "в экспорт не попадают" — a class with no owner is not apibase's status
    to report, sales' own foreign_thread/unmatched handling already covers
    "nobody has taken this").
  - "replied" (the third value the shared schema allows, see sales'
    incoming-pass.js auto_reply outcome) is NEVER produced by this script:
    email-intake.py's own cascade (H3) is read-only IMAP + classification,
    it never sends mail, so no apibase-owned email_events row could ever
    have had an actual reply sent for it. Listed in the schema for parity
    with the shared status vocabulary ruling-1 defines once for both
    tenants, not because apibase emits it.

Window: 14 days on received_at (ruling-1 §2: "Окно экспорта 14 дней"), same
boundary D-48 draws for sales' own mailbox scan.

Cron (dispatcher installs, not this task — same convention as fleet-touches-
export.py's own header): runs right after email-intake.py's LIVE daily pull
finishes, before sales' 08:00 incoming pass reads today's mail (ruling-1 §2:
"07:25 -> 07:40, чтобы проход sales в 08:00 разметил письма того же утра").
email-intake.py's own header comment says 07:00, but the live crontab entry
(`crontab -l`, apibase user) actually runs it at 07:25 — trust the live
crontab, not the stale comment in a file this task may not edit. This
script must therefore land at 07:40, one clean cycle after the real 07:25
intake run, not at 07:25 itself (that would race the intake write this
script reads):

    40 7 * * * cd /home/apibase/apibase-fleet && /usr/bin/python3 scripts/autopilot/email-status-export.py >> /home/apibase/apibase-fleet/logs/email-status-export-cron.log 2>&1

No secrets file is sourced (unlike email-intake.py's own cron line): this
script only reaches Postgres via autopilot_common.psql's docker-exec path
with default container/user/db names, and sends no Telegram notices, so it
needs no other environment variables.
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autopilot_common as ap  # noqa: E402

OUTPUT_DIR = "/var/tmp/fleet-touches"
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "apibase-email-status.json")
WINDOW_DAYS = 14

# Mirrors migration 0022's email_events_class_check literally (same
# convention email-intake.py's own EMAIL_CLASSES already uses against the
# same constraint) — kept independent of email-intake.py on purpose, see
# module docstring.
EMAIL_CLASSES = frozenset([
    "KEY_EXPIRES", "KEY_REVOKED", "DEPRECATION", "SUNSET", "ENDPOINT_CHANGE",
    "PRICING_CHANGE", "PAYMENT_FAILED", "QUOTA", "MAINTENANCE", "SECURITY_CHANGE",
    "ACCOUNT_ACTION", "MARKETING", "UNMATCHED", "DEFERRED_BUDGET",
    "LIMIT_CHANGE", "PARTNER_REPLY",
])

NEEDS_OPERATOR = "needs_operator"
HANDLED = "handled"
EXCLUDED = None  # never exported

CLASS_STATUS_MAP = {
    # HUMAN_KEY (routing.json) — a key/credential fact, only the operator can act.
    "KEY_EXPIRES": NEEDS_OPERATOR,
    "KEY_REVOKED": NEEDS_OPERATOR,
    # HUMAN_ONLY (routing.json) — money, always human, no autobranch ever exists.
    "PAYMENT_FAILED": NEEDS_OPERATOR,
    "PRICING_CHANGE": NEEDS_OPERATOR,
    # AUTO (routing.json, kind EMAIL_NOTICE) — the engine files/closes its own
    # fleet task for these, no operator action is the email export's own job.
    "DEPRECATION": HANDLED,
    "SUNSET": HANDLED,
    "ENDPOINT_CHANGE": HANDLED,
    "MAINTENANCE": HANDLED,
    "SECURITY_CHANGE": HANDLED,
    "ACCOUNT_ACTION": HANDLED,
    "LIMIT_CHANGE": HANDLED,
    # MIXED (routing.json, kind QUOTA_LOW) — engine self-action is the primary
    # path; the diagnostic fleet task alongside it is not operator-facing.
    "QUOTA": HANDLED,
    # Explicit, ruling-1 §2.
    "MARKETING": HANDLED,
    "PARTNER_REPLY": NEEDS_OPERATOR,
    # Never exported.
    "UNMATCHED": EXCLUDED,
    "DEFERRED_BUDGET": EXCLUDED,
}


def partner_reply_ref(msg_id, provider_match, operator_dir=None):
    """Reproduces email-intake.py's write_partner_reply_operator_files()
    filename formula read-only (PARTNER-<provider>-<6 hex sha256(msg_id)>.md)
    and returns it ONLY if that exact file is actually on disk — never a
    fabricated ref (SG-21a acceptance: 'ref на существующие PARTNER-*.md').
    Missing file (e.g. this export raced ahead of write_partner_reply_
    operator_files() in the same intake run) -> None, logged, same fail-soft
    spirit as the rest of this codebase's exports."""
    operator_dir = operator_dir or ap.OPERATOR_DIR
    digest = hashlib.sha256((msg_id or "").encode("utf-8", "replace")).hexdigest()[:6]
    provider_label = provider_match or "unknown"
    filename = f"PARTNER-{provider_label}-{digest}.md"
    if os.path.exists(os.path.join(operator_dir, filename)):
        return filename
    ap.notice(
        f"молчу: email-status-export expected {filename} in {operator_dir} for "
        f"PARTNER_REPLY msg_id={msg_id!r} but the file is not there yet — ref left null"
    )
    return None


def fetch_rows(window_days=WINDOW_DAYS):
    """[(msg_id, class, provider_match, incident_id, processed_at_text), ...]
    for every email_events row within the window whose class maps to a
    reported status (UNMATCHED/DEFERRED_BUDGET excluded at the SQL level
    too, not just in build_messages() — no reason to pull rows this export
    will just throw away). Returns [] (not None) on any DB error, same
    fail-soft contract as ap.psql itself — a DB outage must not crash this
    script, only produce an honest empty/stale-timestamped export."""
    excluded = ",".join(ap.sql_literal(c) for c, s in CLASS_STATUS_MAP.items() if s is EXCLUDED)
    sql = (
        "SELECT msg_id, class, COALESCE(provider_match, ''), COALESCE(incident_id::text, ''), "
        "processed_at::text FROM email_events "
        f"WHERE received_at >= now() - interval '{int(window_days)} days' "
        f"AND class NOT IN ({excluded}) "
        "ORDER BY received_at"
    )
    out, rc = ap.psql(sql)
    if rc != 0:
        ap.notice(f"молчу: email-status-export could not read email_events: {out}")
        return []
    rows = []
    for line in out.splitlines():
        if not line.strip():
            continue
        parts = line.split(ap.SEP)
        if len(parts) != 5:
            ap.notice(f"молчу: email-status-export skipping malformed row: {line!r}")
            continue
        rows.append(tuple(parts))
    return rows


def build_messages(rows, operator_dir=None):
    """Pure merge, no I/O beyond partner_reply_ref()'s own existence check —
    rows -> the schema SG-21 ruling-1 §2 defines. A class missing from
    CLASS_STATUS_MAP (should never happen, selftest() checks coverage) is
    treated the same as an explicitly-excluded one: skipped, not crashed."""
    messages = []
    for msg_id, cls, provider_match, incident_id, processed_at in rows:
        status = CLASS_STATUS_MAP.get(cls, EXCLUDED)
        if status is EXCLUDED:
            continue
        if cls == "PARTNER_REPLY":
            ref = partner_reply_ref(msg_id, provider_match or None, operator_dir)
        elif incident_id:
            ref = f"incident:{incident_id}"
        else:
            ref = None
        messages.append({
            "msg_id": msg_id,
            "status": status,
            "ref": ref,
            "handled_at": processed_at,
        })
    return messages


def write_output(messages, output_path=OUTPUT_PATH, now=None):
    now = now or datetime.now(timezone.utc)
    payload = {
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "apibase (SG-21a)",
        "messages": messages,
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    tmp_path = output_path + f".tmp.{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False, sort_keys=False)
        f.write("\n")
    os.chmod(tmp_path, 0o644)
    os.replace(tmp_path, output_path)


def main():
    rows = fetch_rows()
    messages = build_messages(rows)
    write_output(messages)
    print(f"email-status-export: wrote {len(messages)} message(s) to {OUTPUT_PATH}")
    return 0


# ---------------------------------------------------------------------------
# --selftest: pure logic against fixtures, plus one real-file world guarded
# by DB/file reachability (never fatal if either is unavailable — same
# fail-soft spirit as fleet-touches-export.py's own selftest()).
# ---------------------------------------------------------------------------
def selftest():
    assert set(CLASS_STATUS_MAP) == EMAIL_CLASSES, (
        f"CLASS_STATUS_MAP must cover exactly EMAIL_CLASSES — "
        f"missing {EMAIL_CLASSES - set(CLASS_STATUS_MAP)}, "
        f"extra {set(CLASS_STATUS_MAP) - EMAIL_CLASSES}"
    )
    assert CLASS_STATUS_MAP["UNMATCHED"] is EXCLUDED
    assert CLASS_STATUS_MAP["DEFERRED_BUDGET"] is EXCLUDED
    assert CLASS_STATUS_MAP["PARTNER_REPLY"] == NEEDS_OPERATOR
    assert CLASS_STATUS_MAP["MARKETING"] == HANDLED
    assert CLASS_STATUS_MAP["PAYMENT_FAILED"] == NEEDS_OPERATOR
    assert CLASS_STATUS_MAP["KEY_REVOKED"] == NEEDS_OPERATOR
    assert HANDLED != NEEDS_OPERATOR
    print("world 1 (CLASS_STATUS_MAP covers every EMAIL_CLASSES value, spot checks match ruling-1 §2): OK")

    rows = [
        ("<a@x>", "PARTNER_REPLY", "fireworks", "", "2026-09-23 05:03:24+00"),
        ("<b@x>", "SECURITY_CHANGE", "acme", "11111111-1111-1111-1111-111111111111", "2026-09-23 05:03:25+00"),
        ("<c@x>", "MAINTENANCE", "", "", "2026-09-23 05:03:26+00"),
        ("<d@x>", "MARKETING", "", "", "2026-09-23 05:03:27+00"),
        ("<e@x>", "UNMATCHED", "", "", "2026-09-23 05:03:28+00"),
    ]
    tmp_operator_dir = "/tmp/email-status-export-selftest-operator"
    os.makedirs(tmp_operator_dir, exist_ok=True)
    with open(os.path.join(tmp_operator_dir, f"PARTNER-fireworks-{hashlib.sha256(b'<a@x>').hexdigest()[:6]}.md"), "w") as f:
        f.write("fixture\n")
    messages = build_messages(rows, operator_dir=tmp_operator_dir)
    by_id = {m["msg_id"]: m for m in messages}
    assert len(messages) == 4, f"UNMATCHED must never appear, got {len(messages)}: {messages}"
    assert "<e@x>" not in by_id
    assert by_id["<a@x>"]["status"] == NEEDS_OPERATOR
    assert by_id["<a@x>"]["ref"] == f"PARTNER-fireworks-{hashlib.sha256(b'<a@x>').hexdigest()[:6]}.md"
    assert by_id["<b@x>"]["status"] == HANDLED
    assert by_id["<b@x>"]["ref"] == "incident:11111111-1111-1111-1111-111111111111"
    assert by_id["<c@x>"]["status"] == HANDLED
    assert by_id["<c@x>"]["ref"] is None, "no incident_id -> no ref, never fabricated"
    assert by_id["<d@x>"]["status"] == HANDLED
    print("world 2 (fixture rows: PARTNER_REPLY ref resolved from real file, incident ref, null ref, UNMATCHED dropped): OK")

    rows_missing_file = [("<z@x>", "PARTNER_REPLY", "ghostcorp", "", "2026-09-23 05:03:29+00")]
    messages_missing = build_messages(rows_missing_file, operator_dir=tmp_operator_dir)
    assert messages_missing[0]["status"] == NEEDS_OPERATOR
    assert messages_missing[0]["ref"] is None, "missing PARTNER-*.md on disk must never produce a fabricated ref"
    print("world 3 (PARTNER_REPLY with no matching file on disk -> status still reported, ref null, not fabricated): OK")

    real_rows = fetch_rows()
    real_messages = build_messages(real_rows)
    real_by_id = {m["msg_id"]: m for m in real_messages}
    known_partners = {
        "<1790129428235.f40b55e9-97d7-4ae4-9e69-2db9b90fa557@26117460t.system.stability.ai>": "PARTNER-stability-e8f1b3.md",
        "<125372b6-b532-4e91-ac3e-1fb40d97521d@service.usepylon.com>": "PARTNER-fireworks-c65d1a.md",
        "<e231fdf5-1a950def-1790130219-215476061833529-2897324@api-platform.intercom-mail-300.com>": "PARTNER-perplexity-c00f10.md",
    }
    found = 0
    for mid, expected_ref in known_partners.items():
        m = real_by_id.get(mid)
        if m is None:
            ap.notice(f"world 4: known partner msg_id {mid!r} not in the real 14-day window (DB may have rotated) — skipped, not failed")
            continue
        assert m["status"] == NEEDS_OPERATOR, m
        assert m["ref"] == expected_ref, f"{mid}: expected ref {expected_ref!r}, got {m['ref']!r}"
        found += 1
    print(f"world 4 (real DB + real operator dir, read-only): {len(real_messages)} message(s) in export, "
          f"{found}/3 known partner threads verified present with correct status+ref: OK")

    print("email-status-export --selftest: ALL WORLDS OK")
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        raise SystemExit(selftest())
    raise SystemExit(main())
