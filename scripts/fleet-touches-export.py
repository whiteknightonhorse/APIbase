#!/usr/bin/env python3
"""fleet-touches-export.py — SG-04 (SG-00 ruling-1 §3): apibase's half of the
cross-tenant "who already touched which partner org" export. sales (SG-05) runs
a 30-day quiet window per organization before sending its own outreach; without
this file sales has no way to know apibase already emailed/form-submitted the
same 11 organizations on 2026-09-23 (T-0155 FT-9b/FT-10), so it would happily
re-approach Stability AI, Firecrawl etc. and create the exact intertenant
duplicate already observed once (Firecrawl: apibase form-onboarding email
crossed a live provek partner thread, AUTOPILOT-PROGRESS.md#T-0155-PROVIDER-REPLIES).

READ-ONLY, three sources, apibase side only (T-75/T-72 boundary: this script
never touches sales.db, never sends mail, never edits autopilot):

  1. The T-0155 organization list itself. No live machine-readable copy exists
     (the 11 orgs + channel + contact are prose in
     AUTOPILOT-PROGRESS.md#T-0155-PROVIDER-REPLIES, "Что отправлено 2026-09-23").
     T0155_ORGANIZATIONS below IS the one machine-readable copy — keep it in
     sync with that section by hand if the anchor content ever changes; this
     script does not re-parse the prose.
  2. /home/apibase/.config/autopilot/partner-reply-threads.json — which of the
     11 have a monitored outbound Message-ID (email channel only; form
     submissions never create a thread, see the file's own _comment).
  3. /home/apibase/autopilot/operator/PARTNER-*.md — actual reply records
     (received_at, from-domain, msg_id) email-intake.py already classified as
     PARTNER_REPLY. Read-only glob; nothing here writes into autopilot's tree.

Output: /var/tmp/fleet-touches/apibase-touches.json, mode 644, one line per
organization with date_sent + channel (SG-04 acceptance: "11 организаций с
датами и каналами"), plus reply status when a PARTNER-*.md record exists.

Directory permission note (found by this task, not assumed): /var/tmp/fleet-touches
already existed when this script was first written, created by sales's own
SG-05-adjacent export (owned sales:sales, mode 775) — apibase could not write
into it under that mode (only "other", no write bit). Fixed once by hand to
1777 (same convention as /var/tmp itself: sticky bit so neither tenant can
delete the other's file, full write for both). This script does NOT attempt to
chmod the directory itself on every run — a cron job silently re-widening
permissions on a directory it does not own is worse than failing loudly, so a
future permission regression here is a visible write failure, not something to
paper over with an embedded sudo call.

Cron (for the dispatcher to install, not installed by this task):
  0 * * * * cd /home/apibase/apibase && python3 scripts/fleet-touches-export.py >> logs/fleet-touches-export-cron.log 2>&1
"""
import glob
import json
import os
import re
import sys
from datetime import datetime, timezone

PARTNER_REPLY_THREADS_PATH = "/home/apibase/.config/autopilot/partner-reply-threads.json"
PARTNER_REPLY_DIR = "/home/apibase/autopilot/operator"
OUTPUT_DIR = "/var/tmp/fleet-touches"
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "apibase-touches.json")

# Source: AUTOPILOT-PROGRESS.md#T-0155-PROVIDER-REPLIES, "Что отправлено
# 2026-09-23" (FT-9b/FT-10 of T-0155, operator-sent). All 11 sent the same day.
T0155_ORGANIZATIONS = [
    {"organization": "fireworks", "channel": "email", "contact": "support@fireworks.ai", "date_sent": "2026-09-23"},
    {"organization": "stability", "channel": "email", "contact": "platform@stability.ai", "date_sent": "2026-09-23"},
    {"organization": "perplexity", "channel": "email", "contact": "api@perplexity.ai", "date_sent": "2026-09-23"},
    {"organization": "groq", "channel": "form", "contact": "groq.com/contact", "date_sent": "2026-09-23"},
    {"organization": "cohere", "channel": "form", "contact": "cohere.com/contact-sales", "date_sent": "2026-09-23"},
    {"organization": "mistral", "channel": "form", "contact": "mistral.ai/contact", "date_sent": "2026-09-23"},
    {"organization": "elevenlabs", "channel": "form", "contact": "elevenlabs.io/contact-sales", "date_sent": "2026-09-23"},
    {"organization": "replicate", "channel": "form", "contact": "replicate.com/support", "date_sent": "2026-09-23"},
    {"organization": "cartesia", "channel": "form", "contact": "cartesia.ai/contact", "date_sent": "2026-09-23"},
    {"organization": "openweather", "channel": "form", "contact": "home.openweathermap.org/questions", "date_sent": "2026-09-23"},
    {"organization": "firecrawl", "channel": "form", "contact": "firecrawl.dev/enterprise", "date_sent": "2026-09-23"},
]


def load_threaded_providers(path):
    """Set of provider keys that have a monitored outbound email thread. Missing/
    unreadable file -> empty set (NOINFO, never crashes the export)."""
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return set()
    providers = set()
    for entry in data.get("known_sent_message_ids", []):
        if isinstance(entry, dict) and entry.get("provider"):
            providers.add(entry["provider"])
    return providers


PARTNER_HEADER_RE = re.compile(r"^#\s*PARTNER_REPLY\s*—\s*(\S+)", re.MULTILINE)
PARTNER_FIELD_RE = re.compile(r"^-\s*(msg_id|from|received_at):\s*(.+)$", re.MULTILINE)


def load_partner_replies(directory):
    """provider -> {msg_id, from, received_at} parsed from each PARTNER-*.md
    (email-intake.py's own PARTNER_REPLY record format). Directory missing or
    a given file unreadable/malformed is skipped, never fatal — a reply we
    can't parse is the same as no reply for this export, not a crash."""
    replies = {}
    for path in sorted(glob.glob(os.path.join(directory, "PARTNER-*.md"))):
        try:
            with open(path, encoding="utf-8") as f:
                text = f.read()
        except OSError:
            continue
        header = PARTNER_HEADER_RE.search(text)
        if not header:
            continue
        provider = header.group(1)
        fields = dict(PARTNER_FIELD_RE.findall(text))
        if not fields:
            continue
        replies[provider] = {
            "msg_id": fields.get("msg_id", "").strip(),
            "from": fields.get("from", "").strip(),
            "received_at": fields.get("received_at", "").strip(),
        }
    return replies


def build_touches(organizations, threaded_providers, replies):
    """Pure merge, no I/O — organizations (T0155 list) enriched with whether a
    thread exists and the actual reply record when one landed. Order preserved
    from T0155_ORGANIZATIONS (stable output, easy diffing run to run)."""
    touches = []
    for org in organizations:
        name = org["organization"]
        reply = replies.get(name)
        touches.append({
            **org,
            "has_reply_thread": name in threaded_providers,
            "reply": reply,
        })
    return touches


def write_output(touches, output_path, now=None):
    now = now or datetime.now(timezone.utc)
    payload = {
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "apibase (SG-04 of SG-00 ruling-1)",
        "organizations": touches,
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    try:
        os.chmod(os.path.dirname(output_path), 0o755)
    except PermissionError:
        pass  # directory may be owned by another tenant (sales) — best effort only
    tmp_path = output_path + f".tmp.{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False, sort_keys=False)
        f.write("\n")
    os.chmod(tmp_path, 0o644)
    os.replace(tmp_path, output_path)


def main():
    threaded_providers = load_threaded_providers(PARTNER_REPLY_THREADS_PATH)
    replies = load_partner_replies(PARTNER_REPLY_DIR)
    touches = build_touches(T0155_ORGANIZATIONS, threaded_providers, replies)
    write_output(touches, OUTPUT_PATH)
    print(f"fleet-touches-export: wrote {len(touches)} organization(s) to {OUTPUT_PATH}")
    return 0


# ---------------------------------------------------------------------------
# --selftest: pure logic, no filesystem writes.
# ---------------------------------------------------------------------------
def selftest():
    assert len(T0155_ORGANIZATIONS) == 11, \
        f"T-0155 list must be exactly 11 organizations, got {len(T0155_ORGANIZATIONS)}"
    names = [o["organization"] for o in T0155_ORGANIZATIONS]
    assert len(set(names)) == 11, f"organization names must be unique, got {names}"
    for org in T0155_ORGANIZATIONS:
        assert org["channel"] in ("email", "form"), f"unknown channel: {org}"
        assert org["date_sent"], f"missing date_sent: {org}"
    email_orgs = {o["organization"] for o in T0155_ORGANIZATIONS if o["channel"] == "email"}
    assert email_orgs == {"fireworks", "stability", "perplexity"}, \
        f"email-channel orgs must be exactly the 3 that create threads, got {email_orgs}"
    print("world 1 (T0155 list: 11 unique orgs, valid channels, all dated): OK")

    touches = build_touches(
        T0155_ORGANIZATIONS,
        threaded_providers={"fireworks", "stability", "perplexity"},
        replies={"fireworks": {"msg_id": "<x>", "from": "service.usepylon.com", "received_at": "2026-09-23 02:21:13+00"}},
    )
    by_name = {t["organization"]: t for t in touches}
    assert by_name["fireworks"]["has_reply_thread"] is True
    assert by_name["fireworks"]["reply"]["from"] == "service.usepylon.com"
    assert by_name["groq"]["has_reply_thread"] is False
    assert by_name["groq"]["reply"] is None
    assert by_name["stability"]["has_reply_thread"] is True
    assert by_name["stability"]["reply"] is None, "thread exists but no PARTNER-*.md parsed for stability in this world"
    print("world 2 (merge: thread-without-reply vs reply vs neither, all distinguishable): OK")

    real_replies = load_partner_replies(PARTNER_REPLY_DIR)
    real_threaded = load_threaded_providers(PARTNER_REPLY_THREADS_PATH)
    real_touches = build_touches(T0155_ORGANIZATIONS, real_threaded, real_replies)
    assert len(real_touches) == 11
    print(f"world 3 (real files on disk, read-only): {len(real_replies)} reply record(s), "
          f"{len(real_threaded)} threaded provider(s), 11 organizations in output: OK")

    print("fleet-touches-export --selftest: ALL WORLDS OK")
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        raise SystemExit(selftest())
    raise SystemExit(main())
