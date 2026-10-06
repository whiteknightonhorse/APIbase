#!/usr/bin/env python3
"""merchant-mail.py — T-INT-18 (spec §12.2 "Outgoing mail"). Hourly cron CANDIDATE (not installed).

Sends the transactional merchant mail that incident-engine.py only QUEUES (email_events,
direction='out', status='queued'; see queue_merchant_email()). Resend API only, sender
integrator@apibase.pro, recipient shop_merchants.contact_email, language always 'en' (RU/BY are
RESTRICTED countries; the dispatcher translates by hand for any manual reply).

Gates, in order, BEFORE any send:
  (a) config/integrator/mail-approval.json {ruling, approved_at} — written by the dispatcher after
      Fable's ruling on the templates. Missing/invalid -> every queued row stays queued with
      reason='ruling_missing'; Resend is never called.
  (b) the Resend key: PROVIDER_KEY_RESEND through the connected_db.py contour (never os.environ).
  (c) Resend domain apibase.pro has status 'verified' (GET /domains). Otherwise rows get
      reason='domain_unverified', a report is printed and the script exits 2 (the operator's
      stop-and-report decision of 2026-10-05).

Failure policy: attempts++ and next_attempt_at=+1h; the 24th failure -> status='failed' (the source
incident-engine.py already reads for WEBHOOK_FAILED provider=merchant:<id>). Logs carry msg_id /
merchant_id / kind / status only — never an address or a body.

Exit codes: 0 ok (incl. ruling_missing: nothing to do yet), 2 domain not verified, 3 no usable key.
"""
import importlib.util
import json
import logging
import os
import re
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import autopilot_common as ap  # noqa: E402

REPO = os.path.dirname(os.path.dirname(HERE))
APPROVAL_PATH = os.environ.get("AUTOPILOT_MAIL_APPROVAL_PATH",
                               os.path.join(REPO, "config", "integrator", "mail-approval.json"))
TEMPLATES_DIR = os.path.join(HERE, "templates", "merchant")
RESEND_API = os.environ.get("AUTOPILOT_RESEND_API", "https://api.resend.com")
MAIL_DOMAIN = "apibase.pro"
SENDER = f"APIbase <integrator@{MAIL_DOMAIN}>"
KEY_NAME = "PROVIDER_KEY_RESEND"
CHECK_URL = f"https://{MAIL_DOMAIN}/integrator/check/"
MAX_ATTEMPTS = 24
LANG = "en"
KINDS = ("connect_failed", "webhook_failed", "merchant_unresponsive", "refund_overdue",
         "catalog_rejected", "payout_change", "key_rotated", "pii_delivered", "pii_undeliverable",
         "dispute_rate_warning", "merchant_disputes_suspended", "fee_invoice")

log = logging.getLogger("merchant-mail")


# ---------------------------------------------------------------- gates / key
def load_approval(path=None):
    """Returns the approval dict, or None when the dispatcher has not placed a valid one."""
    try:
        with open(path or APPROVAL_PATH, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return None
    if isinstance(d, dict) and str(d.get("ruling") or "").strip() and str(d.get("approved_at") or "").strip():
        return d
    return None


def _connected_db():
    spec = importlib.util.spec_from_file_location("connected_db_for_mail", ap.CONNECTED_DB_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_resend_key():
    """The key contour: connected_db.py decides that the provider is connected and that the key
    name is present in its env file; the value is read from THAT module's ENV_FILE. Never
    os.environ. Returns (key, None) or (None, reason)."""
    try:
        cdb = _connected_db()
        if not cdb.is_connected("resend"):
            return None, "resend is not connected in connected_db.py"
        if KEY_NAME not in cdb.env_key_names():
            return None, f"{KEY_NAME} is not in the connected_db.py env file"
        with open(cdb.ENV_FILE, encoding="utf-8") as f:
            for raw in f:
                ln = raw.strip()
                if ln.startswith(KEY_NAME + "="):
                    v = ln.split("=", 1)[1].strip().strip('"').strip("'")
                    if v:
                        return v, None
        return None, f"{KEY_NAME} has an empty value"
    except Exception as e:  # noqa: BLE001 — a broken contour is data, not a crash
        return None, f"connected_db.py contour failed: {type(e).__name__}"


def http_request(method, path, key, payload=None, idem=None):
    """One Resend call. Returns (status, parsed_json_or_None). Tests replace this function."""
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(RESEND_API + path, data=data, method=method)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "apibase-merchant-mail/1")
    if idem:
        req.add_header("Idempotency-Key", idem)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read()
            code = r.status
    except urllib.error.HTTPError as e:
        code, body = e.code, e.read()
    except Exception:  # noqa: BLE001
        return 0, None
    try:
        return code, json.loads(body)
    except ValueError:
        return code, None


def domain_verified(key):
    code, js = http_request("GET", "/domains", key)
    if code != 200 or not isinstance(js, dict):
        return False
    return any(d.get("name") == MAIL_DOMAIN and d.get("status") == "verified" for d in (js.get("data") or []))


# ---------------------------------------------------------------- rendering
def _clean(v, limit=120):
    return re.sub(r"[\r\n\t{}]+", " ", str(v or "")).strip()[:limit]


def render(template, lang, values):
    """Returns (subject, text). The subject line carries no placeholder (header-injection safe)."""
    if template not in KINDS:
        raise ValueError("unknown template")
    with open(os.path.join(TEMPLATES_DIR, f"{template}.{lang}.md"), encoding="utf-8") as f:
        raw = f.read()
    head, _, body = raw.partition("\n\n")
    subject = head[len("Subject:"):].strip() if head.startswith("Subject:") else head.strip()
    for k, v in values.items():
        body = body.replace("{" + k + "}", _clean(v))
    return subject, body


def _rows(sql):
    out, rc = ap.psql(sql)
    if rc != 0:
        raise RuntimeError("psql failed")
    return [ln.split(ap.SEP) for ln in out.splitlines()] if out else []


def _fmt(col):
    return f"to_char({col} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI \"UTC\"')"


def template_values(template, merchant_id, m):
    """Best-effort placeholders; the engine queues only (template, merchant_id)."""
    vals = {"merchant_name": m["name"], "slug": m["slug"], "order_id": "(see the check page)",
            "due_at": "(see the check page)", "category": "catalog review",
            "invoice_id": "(see your owner page)", "period": "the last month", "amount_usd": "(see your owner page)",
            "fee_wallet": "(see your owner page)"}
    mid = ap.sql_literal(merchant_id)
    try:
        if template == "merchant_unresponsive":
            r = _rows("SELECT order_id::text, " + _fmt("confirm_due_at") + " FROM shop_orders WHERE "
                      f"merchant_id = {mid}::uuid AND state = 'PAID' AND confirm_due_at < now() "
                      "ORDER BY confirm_due_at LIMIT 1")
            if r:
                vals["order_id"], vals["due_at"] = r[0]
        elif template == "refund_overdue":
            r = _rows("SELECT o.order_id::text, " + _fmt("r.due_at") + " FROM shop_refunds r JOIN shop_orders o "
                      f"ON o.order_id = r.order_id WHERE o.merchant_id = {mid}::uuid AND r.status = 'overdue' "
                      "AND r.due_at IS NOT NULL ORDER BY r.due_at LIMIT 1")
            if r:
                vals["order_id"], vals["due_at"] = r[0]
        elif template == "fee_invoice":
            r = _rows("SELECT invoice_id::text, period, amount_usd::text, " + _fmt("due_at") + " FROM shop_fee_invoices "
                      f"WHERE merchant_id = {mid}::uuid AND status IN ('open', 'overdue') "
                      "ORDER BY created_at DESC LIMIT 1")
            if r:
                vals["invoice_id"], vals["period"], vals["amount_usd"], vals["due_at"] = r[0]
            vals["fee_wallet"] = os.environ.get("INTEGRATOR_FEE_WALLET") or "(see the fee invoices in your owner page)"
        elif template == "catalog_rejected":
            r = _rows("SELECT category FROM shop_moderation_reviews WHERE "
                      f"merchant_id = {mid}::uuid AND category IS NOT NULL ORDER BY at DESC LIMIT 1")
            if r and r[0][0]:
                vals["category"] = r[0][0]
    except RuntimeError:
        pass
    return vals


# ---------------------------------------------------------------- queue
def _set(msg_id, assignments):
    ap.psql(f"UPDATE email_events SET {assignments} WHERE msg_id = {ap.sql_literal(msg_id)} "
            "AND direction = 'out' AND status = 'queued'")


def hold_all(reason):
    """Gate failed: every queued row stays queued, with the reason on it."""
    out, _ = ap.psql("UPDATE email_events SET reason = " + ap.sql_literal(reason) +
                     " WHERE direction = 'out' AND status = 'queued' RETURNING msg_id")
    return len(out.splitlines()) if out else 0


def due_rows():
    return _rows("SELECT msg_id, merchant_id::text, kind, template, attempts::text FROM email_events "
                 "WHERE direction = 'out' AND status = 'queued' AND merchant_id IS NOT NULL "
                 "AND (next_attempt_at IS NULL OR next_attempt_at <= now()) ORDER BY received_at, msg_id")


def record_failure(msg_id, attempts, reason):
    n = attempts + 1
    if n >= MAX_ATTEMPTS:
        _set(msg_id, f"attempts = {n}, status = 'failed', next_attempt_at = NULL, reason = {ap.sql_literal(reason)}")
        return "failed"
    _set(msg_id, f"attempts = {n}, next_attempt_at = now() + interval '1 hour', reason = {ap.sql_literal(reason)}")
    return "queued"


def send_one(key, msg_id, merchant_id, kind, template, attempts):
    """Returns the resulting status: sent | queued | failed."""
    try:
        r = _rows("SELECT slug, name, contact_email FROM shop_merchants "
                  f"WHERE merchant_id = {ap.sql_literal(merchant_id)}::uuid")
    except RuntimeError:
        r = []
    if not r or not r[0][2]:
        return record_failure(msg_id, attempts, "merchant_missing")
    m = {"slug": r[0][0], "name": r[0][1]}
    try:
        subject, text = render(template, LANG, template_values(template, merchant_id, m))
    except (ValueError, OSError):
        return record_failure(msg_id, attempts, "template_missing")
    code, js = http_request("POST", "/emails", key, {
        "from": SENDER, "to": [r[0][2]], "subject": subject, "text": text,
    }, idem=msg_id)
    mid = js.get("id") if isinstance(js, dict) else None
    if 200 <= code < 300 and mid:
        _set(msg_id, f"status = 'sent', provider_message_id = {ap.sql_literal(mid)}, "
                     f"attempts = {attempts + 1}, next_attempt_at = NULL, reason = NULL")
        return "sent"
    return record_failure(msg_id, attempts, f"resend_http_{code}")


def run():
    counts = {"sent": 0, "queued": 0, "failed": 0}
    if load_approval() is None:
        n = hold_all("ruling_missing")
        print(f"merchant-mail: HOLD — {APPROVAL_PATH} missing or invalid; {n} queued row(s) marked "
              "reason=ruling_missing; Resend not called. Dispatcher: place mail-approval.json after "
              "Fable's ruling on the templates.")
        return 0
    key, why = load_resend_key()
    if not key:
        n = hold_all("key_missing")
        print(f"merchant-mail: STOP — no Resend key ({why}); {n} queued row(s) marked reason=key_missing.")
        return 3
    if not domain_verified(key):
        n = hold_all("domain_unverified")
        print(f"merchant-mail: STOP — Resend domain {MAIL_DOMAIN} is not 'verified'; {n} queued row(s) "
              "marked reason=domain_unverified; nothing sent. Operator: see "
              "docs/operator/EMAIL-INTEGRATOR-SETUP.md (Resend domain + DKIM/SPF/DMARC).")
        return 2
    for msg_id, merchant_id, kind, template, attempts in due_rows():
        st = send_one(key, msg_id, merchant_id, kind, template or kind, int(attempts or 0))
        counts[st] += 1
        log.info("msg_id=%s merchant_id=%s kind=%s status=%s", msg_id, merchant_id, kind, st)
    print(f"merchant-mail: OK sent={counts['sent']} requeued={counts['queued']} failed={counts['failed']}")
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    sys.exit(run())
