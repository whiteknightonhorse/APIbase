#!/usr/bin/env python3
"""layer3_review.py -- T-0569, F-13 layer 3: the nightly model re-review of the shop catalog.

Independent of the night orchestra and of the generic Fable pause. One run:
  1. stand down only for a live ~/.fleet-paused-until whose reason line contains `moderation`;
  2. select due items (read-only SQL, see CANDIDATE_SQL): merchants never reviewed by layer `llm`,
     then products (moderation_status ok|flagged) whose newest llm/human review is older than
     7 days or missing, oldest first, at most --cap (default 60) in total;
  3. one `claude --print --model haiku` call per item, answer checked against the strict grammar
     (`merchant: <v>` + `product <id>: <v>`, v = ok|flag:<slug>|reject:<slug>);
  4. verdicts go through POST /api/v1/shop/internal/moderation/result (x-orchestra-key) as layer `llm`.
A model/API failure never changes a merchant or product: nothing is posted, the item stays due.
The role prompt is private (never in the public repository): LAYER3_ROLE_FILE, default
~/.config/autopilot/layer3-role.md; a missing file stops the run before any model call.

Usage: layer3_review.py [--cap N] [--dry-run]     (--dry-run lists candidates, no model, no write)
Env: LAYER3_API_BASE (default http://127.0.0.1:8880), ORCHESTRA_INTERNAL_KEY or
~/.config/autopilot/orchestra-internal.key, LAYER3_LOG_DIR, LAYER3_PAUSE_FILE, LAYER3_ROLE_FILE.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
CATEGORIES_PATH = os.path.join(ROOT, "config", "integrator", "prohibited-categories.json")
ROLE_PATH = os.environ.get("LAYER3_ROLE_FILE", os.path.expanduser("~/.config/autopilot/layer3-role.md"))
PAUSE_FILE = os.environ.get("LAYER3_PAUSE_FILE", os.path.expanduser("~/.fleet-paused-until"))
LOG_DIR = os.environ.get("LAYER3_LOG_DIR", os.path.expanduser("~/apibase/scripts/moderation/logs"))
API_BASE = os.environ.get("LAYER3_API_BASE", "http://127.0.0.1:8880")
KEY_FILE = os.path.expanduser("~/.config/autopilot/orchestra-internal.key")
DEFAULT_CAP = 60
MAX_FIELD = 600
PRODUCTS_PER_MERCHANT = 10

# Read-only. Merchants first (never reviewed by layer llm, scope merchant), then products by newest
# llm/human review ascending (never reviewed first). Merchants of status pending|active only.
CANDIDATE_SQL = """
SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json) FROM (
  SELECT kind, merchant_id, product_id, last_review_at FROM (
    SELECT 'merchant' AS kind, m.merchant_id::text AS merchant_id, NULL::text AS product_id,
           NULL::timestamptz AS last_review_at, m.created_at AS sort_at
      FROM shop_merchants m
     WHERE m.status IN ('pending', 'active')
       AND NOT EXISTS (SELECT 1 FROM shop_moderation_reviews r
                        WHERE r.merchant_id = m.merchant_id AND r.layer = 'llm' AND r.scope = 'merchant')
    UNION ALL
    SELECT 'product', p.merchant_id::text, p.product_id::text, lr.at, COALESCE(lr.at, '-infinity'::timestamptz)
      FROM shop_products p
      JOIN shop_merchants m ON m.merchant_id = p.merchant_id
      LEFT JOIN LATERAL (SELECT max(r.at) AS at FROM shop_moderation_reviews r
                          WHERE r.product_id = p.product_id AND r.scope = 'product'
                            AND r.layer IN ('llm', 'human')) lr ON true
     WHERE m.status IN ('pending', 'active') AND p.moderation_status IN ('ok', 'flagged')
       AND (lr.at IS NULL OR lr.at < now() - interval '7 days')
  ) u
  ORDER BY (kind = 'merchant') DESC, sort_at, product_id
) c
"""
MERCHANT_SQL = """
SELECT COALESCE(row_to_json(t), 'null'::json) FROM (
  SELECT m.merchant_id::text, m.name, m.category, m.country, m.site_url FROM shop_merchants m
   WHERE m.merchant_id = '%s'::uuid) t
"""
PRODUCT_SQL = """
SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
  SELECT p.product_id::text, p.title, p.description, p.category, p.price_usd::text, p.moderation_status
    FROM shop_products p
   WHERE p.merchant_id = '%s'::uuid AND p.moderation_status IN ('ok', 'flagged') %s
   ORDER BY p.updated_at DESC LIMIT %d) t
"""
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
VERDICT_RE = re.compile(r"^(ok|(?:flag|reject):[a-z0-9-]+)$")
MERCHANT_LINE_RE = re.compile(r"^merchant:[ \t]*(\S+)$")
PRODUCT_LINE_RE = re.compile(r"^product[ \t]+([0-9a-fA-F-]{36}):[ \t]*(\S+)$")

_log_fh = None


def log(msg):
    line = f"[{datetime.now(timezone.utc).strftime('%FT%TZ')}] {msg}"
    print(line, flush=True)
    if _log_fh:
        _log_fh.write(line + "\n")
        _log_fh.flush()


def pause_active(path=None, now=None):
    """Live pause whose reason line names moderation. The generic fleet pause (Fable limit) does not count."""
    path = path or PAUSE_FILE
    try:
        lines = open(path, encoding="utf-8").read().splitlines()
    except OSError:
        return False
    epoch = re.sub(r"\D", "", lines[0]) if lines else ""
    if not epoch or int(epoch) <= (now if now is not None else time.time()):
        return False
    return any(l.lower().startswith("reason:") and "moderation" in l.lower() for l in lines[1:])


def select_candidates(rows, cap):
    """Rows arrive ordered by SQL; the cap is the only thing applied here. Returns (items, cap_hit)."""
    return rows[:cap], len(rows) > cap


def sql_json(sql):
    r = subprocess.run(
        ["docker", "exec", "apibase-postgres-1", "psql", "-U", "fleet_ro", "-d", "apibase", "-At", "-c", sql],
        capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise OSError(f"read-only query failed: {r.stderr.strip()[:200]}")
    return json.loads(r.stdout.strip() or "null")


def load_categories():
    with open(CATEGORIES_PATH, encoding="utf-8") as f:
        return [(p["slug"], p["text"]) for p in json.load(f)["prohibited"]]


def _valid_verdict(v, slugs):
    return bool(VERDICT_RE.match(v)) and (v == "ok" or v.split(":", 1)[1] in slugs)


def parse_verdicts(text, slugs, product_ids):
    """(merchant_verdict, {product_id: verdict}) or None when the merchant line is missing/invalid.
    Lines outside the grammar are dropped; a product without a line gets no verdict."""
    known = {str(p).lower() for p in product_ids}
    merchant, products = None, {}
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        mm, pm = MERCHANT_LINE_RE.match(line), PRODUCT_LINE_RE.match(line)
        if mm and merchant is None and _valid_verdict(mm.group(1), slugs):
            merchant = mm.group(1)
        elif pm and pm.group(1).lower() in known and pm.group(1).lower() not in products \
                and _valid_verdict(pm.group(2), slugs):
            products[pm.group(1).lower()] = pm.group(2)
        else:
            log(f"dropped answer line outside the grammar: {line[:80]!r}")
    return None if merchant is None else (merchant, products)


def clip(v):
    return str(v if v is not None else "")[:MAX_FIELD]


def product_data(p):
    d = {k: clip(p.get(k)) for k in ("title", "description", "category", "price_usd")}
    for k in ("product_id", "moderation_status"):
        if p.get(k) is not None:
            d[k] = clip(p.get(k))
    return d


def evidence_of_product(p):
    return json.dumps(product_data(p), ensure_ascii=False, sort_keys=True, indent=1)


def evidence_of(merchant, products):
    data = {"merchant": {k: clip(merchant.get(k)) for k in ("name", "category", "country", "site_url")},
            "products": [product_data(p) for p in products]}
    return json.dumps(data, ensure_ascii=False, sort_keys=True, indent=1)


def build_prompt(role_text, categories, evidence):
    cats = "\n".join(f"  {slug}: {text}" for slug, text in categories)
    return role_text.replace("__CATEGORIES__", cats).replace("__DATA__", evidence)


def default_invoke(prompt):
    scratch = tempfile.mkdtemp(prefix="layer3-cwd-")
    try:
        r = subprocess.run(
            ["claude", "--print", "--model", "haiku", "--restricted", "--safe-mode",
             "--strict-mcp-config", "--tools", "", "--permission-mode", "manual",
             "--no-session-persistence", "--max-budget-usd", "0.05", prompt],
            capture_output=True, text=True, timeout=90, cwd=scratch)
        return r.stdout if r.returncode == 0 else ""
    except (subprocess.TimeoutExpired, OSError):
        return ""
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def service_key():
    k = os.environ.get("ORCHESTRA_INTERNAL_KEY", "").strip()
    if not k and os.path.exists(KEY_FILE):
        k = open(KEY_FILE, encoding="utf-8").read().strip()
    return k


def api_post(key, body):
    req = urllib.request.Request(
        API_BASE + "/api/v1/shop/internal/moderation/result", method="POST",
        data=json.dumps(body).encode(),
        headers={"x-orchestra-key": key, "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def review_item(item, ctx):
    """Reviews one candidate; returns a list of (scope, verdict) actually recorded."""
    if not UUID_RE.match(item["merchant_id"]) or (item["product_id"] and not UUID_RE.match(item["product_id"])):
        log(f"skipped item with a malformed id: {item['merchant_id'][:40]}")
        return []
    merchant = ctx["sql"](MERCHANT_SQL % item["merchant_id"])
    if not merchant:
        return []
    if item["kind"] == "merchant":
        products = ctx["sql"](PRODUCT_SQL % (item["merchant_id"], "", PRODUCTS_PER_MERCHANT))
    else:
        products = ctx["sql"](PRODUCT_SQL % (item["merchant_id"], f"AND p.product_id = '{item['product_id']}'::uuid", 1))
        if not products:
            return []
    evidence = evidence_of(merchant, products)
    parsed = parse_verdicts(ctx["invoke"](build_prompt(ctx["role"], ctx["categories"], evidence)),
                            ctx["slugs"], [p["product_id"] for p in products])
    if parsed is None:
        log(f"{item['kind']} {item['merchant_id']}: model answer rejected by the schema -- stays due")
        return []
    mverdict, pverdicts = parsed
    posts = []
    if item["kind"] == "merchant":
        posts.append(("merchant", {"merchant_id": item["merchant_id"], "verdict": mverdict,
                                   "evidence_hash": hashlib.sha256(evidence.encode()).hexdigest()}))
    for p in products:
        pv = pverdicts.get(str(p["product_id"]).lower())
        if pv is None:
            continue
        posts.append(("product", {"merchant_id": item["merchant_id"], "product_id": p["product_id"], "verdict": pv,
                                  "evidence_hash": hashlib.sha256(evidence_of_product(p).encode()).hexdigest()}))
    out = []
    for scope, body in posts:
        try:
            ctx["post"](body)
            out.append((scope, body["verdict"]))
            log(f"{scope} {body.get('product_id') or body['merchant_id']}: {body['verdict'].split(':')[0]} recorded")
        except (urllib.error.URLError, OSError, ValueError) as e:
            log(f"{scope} {body.get('product_id') or body['merchant_id']}: result not recorded ({type(e).__name__})")
    return out


def run(cap, dry_run=False, ctx=None):
    """Returns (reviewed, flagged, rejected, cap_hit). ctx injects sql/invoke/post/role for tests."""
    ctx = dict(ctx or {})
    ctx.setdefault("sql", sql_json)
    if pause_active():
        log("layer3: moderation pause is live -- model not called")
        return 0, 0, 0, False
    rows = ctx["sql"](CANDIDATE_SQL) or []
    items, cap_hit = select_candidates(rows, cap)
    if dry_run:
        for i in items:
            print(f"{i['kind']}\t{i['merchant_id']}\t{i['product_id'] or '-'}\tlast_review={i['last_review_at'] or 'never'}")
        print(f"layer3 dry-run: {len(items)} of {len(rows)} due items listed (cap {cap}), no model call")
        return 0, 0, 0, cap_hit
    ctx.setdefault("categories", load_categories())
    ctx["slugs"] = {s for s, _ in ctx["categories"]}
    if "role" not in ctx:
        ctx["role"] = open(ROLE_PATH, encoding="utf-8").read()
    ctx.setdefault("invoke", default_invoke)
    if "post" not in ctx:
        key = service_key()
        if not key:
            log("layer3: no service key -- run skipped")
            return 0, 0, 0, False
        ctx["post"] = lambda body: api_post(key, body)
    reviewed = flagged = rejected = 0
    for item in items:
        if pause_active():
            log("layer3: moderation pause went live mid-run -- stopping")
            break
        for _scope, v in review_item(item, ctx):
            reviewed += 1
            flagged += v.startswith("flag")
            rejected += v.startswith("reject")
    log(f"layer3: reviewed {reviewed}, flagged {flagged}, rejected {rejected}, cap hit {'yes' if cap_hit else 'no'}")
    return reviewed, flagged, rejected, cap_hit


def main(argv=None):
    global _log_fh
    ap = argparse.ArgumentParser()
    ap.add_argument("--cap", type=int, default=DEFAULT_CAP)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    if a.cap < 1:
        ap.error("--cap must be >= 1")
    if not a.dry_run:
        try:
            os.makedirs(LOG_DIR, exist_ok=True)
            day = datetime.now(timezone.utc).strftime("%F")
            _log_fh = open(os.path.join(LOG_DIR, f"layer3-{day}.log"), "a", encoding="utf-8")
        except OSError as e:
            print(f"layer3: log dir unavailable ({e}) -- stdout only", file=sys.stderr)
    try:
        run(a.cap, a.dry_run)
    except (OSError, ValueError) as e:
        log(f"layer3: aborted ({type(e).__name__}: {e})")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
