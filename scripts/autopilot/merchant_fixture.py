#!/usr/bin/env python3
"""merchant_fixture.py — T-INT-13. Disposable-Postgres + isolated-env fixture shared by
test-merchant-kinds.py and drills.py's merchant drills (same pattern as AP-11's drill files:
postgres:16.2-alpine in its own container, the repo's real migrations, /tmp scratch dirs; never
apibase-postgres-1, never the taskloop tree, never a real Telegram or Resend call).

Import this module BEFORE autopilot_common: autopilot_common reads its AUTOPILOT_* overrides
at import time.
"""
import glob
import importlib.util
import json
import os
import shutil
import subprocess
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CONTAINER = os.environ.get("INT13_PG_CONTAINER", "autopilot-int13-pg")
SCRATCH = "/tmp/autopilot-int13"
MIGRATIONS = ["0009_autopilot_schema", "0010_provider_status_pause_anchor",
              "0022_email_events_limit_change_partner_reply", "0025_integrator_shop",
              "0026_shop_quote_buyer_company", "0027_shop_quote_mpp_challenge_header",
              "0028_email_events_outbound", "0027_wave3"]


def configure_env():
    env = {
        "AUTOPILOT_PG_CONTAINER": CONTAINER,
        "AUTOPILOT_HEARTBEAT_FILE": f"{SCRATCH}/engine.hb",
        "AUTOPILOT_NOTICES_LOG": f"{SCRATCH}/notices.log",
        "AUTOPILOT_NOTICE_DEDUP_FILE": f"{SCRATCH}/notice-dedup.json",
        "AUTOPILOT_OPERATOR_DIR": f"{SCRATCH}/operator",
        "AUTOPILOT_HUMAN_DONE_DIR": f"{SCRATCH}/human-done",
        "AUTOPILOT_TG_ENV_PATH": f"{SCRATCH}/tg-env-does-not-exist",
        "AUTOPILOT_TASKLOOP_ROOT": f"{SCRATCH}/taskloop",
        "AUTOPILOT_TASKLOOP_QUEUE_DIR": f"{SCRATCH}/taskloop/queue",
        "AUTOPILOT_DAILY_TASK_COUNTER": f"{SCRATCH}/taskloop/state/daily.count",
        "AUTOPILOT_TASK_SEQ_FILE": f"{SCRATCH}/taskloop/state/task-seq",
        "AUTOPILOT_PROVIDER_LIMITS_JSON": f"{SCRATCH}/provider-limits.json",
        "AUTOPILOT_FIX_MD": f"{SCRATCH}/fix-md-does-not-exist.md",
        "AUTOPILOT_FLEET_PAUSE_FILE": f"{SCRATCH}/fleet-paused-until",
        "AUTOPILOT_PROVIDER_DOMAINS_JSON": f"{SCRATCH}/provider-domains.json",
        "AUTOPILOT_EMAIL_STATE_PATH": f"{SCRATCH}/email-state.json",
        "AUTOPILOT_EMAIL_HAIKU_COUNTER": f"{SCRATCH}/haiku-daily.count",
    }
    os.environ.update(env)
    return env


configure_env()


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def psql(sql):
    r = sh(["docker", "exec", "-i", CONTAINER, "psql", "-U", "apibase", "-d", "apibase", "-tAqF", "\x1f", "-c", sql])
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return r.stdout.strip("\n")


def ensure_pg():
    """Starts the container once per process (reused if already up and migrated)."""
    chk = sh(["docker", "exec", CONTAINER, "psql", "-U", "apibase", "-d", "apibase", "-tAc",
              "SELECT to_regclass('public.shop_merchants') IS NOT NULL AND to_regclass('public.shop_stream_sessions') IS NOT NULL "
              "AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='email_events' AND column_name='direction')"])
    if chk.returncode == 0 and chk.stdout.strip() == "t":
        return
    sh(["docker", "rm", "-f", CONTAINER])
    r = sh(["docker", "run", "-d", "--name", CONTAINER, "-e", "POSTGRES_PASSWORD=x",
            "-e", "POSTGRES_USER=apibase", "-e", "POSTGRES_DB=apibase", "postgres:16.2-alpine"])
    if r.returncode != 0:
        raise RuntimeError(f"cannot start disposable postgres: {r.stderr}")
    for _ in range(60):
        time.sleep(1)
        c = sh(["docker", "exec", CONTAINER, "psql", "-h", "127.0.0.1", "-U", "apibase", "-d", "apibase", "-tAc", "SELECT 1"])
        if c.returncode == 0 and c.stdout.strip() == "1":
            break
    else:
        raise RuntimeError("postgres never became ready")
    sh(["docker", "exec", "-i", CONTAINER, "psql", "-U", "apibase", "-d", "apibase"], input=(
        "CREATE TABLE IF NOT EXISTS tools (tool_id text primary key, provider text, status text not null default 'healthy'); "
        "CREATE TABLE IF NOT EXISTS execution_ledger (execution_id text primary key default gen_random_uuid()::text, "
        "tool_id text, cost_usd numeric default 0, latency_ms integer, status text, billing_status text, "
        "created_at timestamptz default now());"))
    for mig in MIGRATIONS:
        with open(os.path.join(ROOT, "prisma", "migrations", mig, "migration.sql")) as f:
            sql = f.read()
        a = sh(["docker", "exec", "-i", CONTAINER, "psql", "-U", "apibase", "-d", "apibase",
                "-v", "ON_ERROR_STOP=1"], input=sql)
        if a.returncode != 0:
            raise RuntimeError(f"migration {mig} failed: {a.stderr}")


def stop_pg():
    sh(["docker", "rm", "-f", CONTAINER])


def reset():
    """Clean slate between tests: DB rows + scratch dirs + pause file."""
    ensure_pg()
    psql("TRUNCATE incidents, email_events, shop_connect_events, shop_moderation_reviews, "
         "shop_refunds, shop_webhook_deliveries, shop_webhook_endpoints, shop_orders, shop_quotes, "
         "shop_merchants CASCADE")
    shutil.rmtree(SCRATCH, ignore_errors=True)
    for sub in ("taskloop/queue", "taskloop/active", "taskloop/done", "taskloop/stuck", "taskloop/state",
                "human-done/processed", "operator"):
        os.makedirs(os.path.join(SCRATCH, sub), exist_ok=True)
    with open(os.path.join(SCRATCH, "provider-limits.json"), "w", encoding="utf-8") as f:
        json.dump({}, f)
    with open(os.path.join(SCRATCH, "provider-domains.json"), "w", encoding="utf-8") as f:
        json.dump({"aliases": {}, "whitelist": []}, f)


def new_merchant(slug="drill-shop", status="active"):
    import uuid
    w = [uuid.uuid4().hex[:40] for _ in range(3)]
    return psql(
        "INSERT INTO shop_merchants (slug, name, category, country, wallet_address, payout_wallet_base, "
        "payout_wallet_tempo, contact_email, site_url, status) VALUES "
        f"('{slug}', 'Drill Shop', 'test', 'DE', '0x{w[0]}', '0x{w[1]}', '0x{w[2]}', "
        f"'owner@drill.invalid', 'https://drill.invalid', '{status}') RETURNING merchant_id").strip()


def new_paid_order(merchant_id, overdue=True):
    """A PAID order past confirm_due_at. shop_orders.quote_id has an FK -> a minimal quote first."""
    # build the quote from its NOT NULL / no-default columns using type-aware dummies
    cols = psql("SELECT column_name || ':' || data_type FROM information_schema.columns "
                "WHERE table_name = 'shop_quotes' AND is_nullable = 'NO' AND column_default IS NULL").splitlines()
    names, vals = [], []
    for c in cols:
        n, t = c.split(":", 1)
        names.append(f'"{n}"')
        if n == "merchant_id":
            vals.append(f"'{merchant_id}'")
        elif t == "uuid":
            vals.append("gen_random_uuid()")
        elif t.startswith("timestamp"):
            vals.append("now() + interval '1 day'")
        elif t in ("numeric", "integer", "bigint"):
            vals.append("1")
        elif t == "jsonb":
            vals.append("'{}'::jsonb")
        elif t == "ARRAY":
            vals.append("'{}'")
        elif t == "boolean":
            vals.append("false")
        else:
            vals.append("'x'")
    qid = psql(f"INSERT INTO shop_quotes ({', '.join(names)}) VALUES ({', '.join(vals)}) RETURNING quote_id").strip()
    due = "now() - interval '1 hour'" if overdue else "now() + interval '1 hour'"
    return psql(
        "INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd, confirm_due_at) VALUES "
        f"('{qid}', '{merchant_id}', 'PAID', 10, {due}) RETURNING order_id").strip()


def load_engine():
    spec = importlib.util.spec_from_file_location("incident_engine_t13", os.path.join(HERE, "incident-engine.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
