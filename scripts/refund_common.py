"""refund_common.py - helpers shared by refund-alerts.py and refund-weekly-summary.py (T-0556).
Monitoring only: read-only SQL, one HTTP GET of /health/refund-wallet, no chain access, no keys."""
import json
import os
import subprocess
import sys
import urllib.request
from decimal import Decimal, InvalidOperation

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "autopilot"))
from autopilot_common import tg_send  # noqa: E402,F401

ROOT = "/home/apibase/apibase"
STATE_DIR = os.environ.get("REFUND_STATE_DIR", f"{ROOT}/scripts/night-orchestra/state")
CONFIG_DIR = os.environ.get("REFUND_CONFIG_DIR", os.path.join(HERE, "..", "config", "autopilot"))
KILL_FILE = os.environ.get("REFUND_PAYOUT_KILL_FILE", f"{ROOT}/wallets/REFUND-PAYOUT-KILL")
HEALTH_URL = os.environ.get("REFUND_HEALTH_URL", "http://127.0.0.1:8880/health/refund-wallet")


def load_tg_strings():
    """Fail-closed: a missing or malformed file raises."""
    with open(os.path.join(CONFIG_DIR, "tg-strings.ru.json"), encoding="utf-8") as f:
        raw = json.load(f)
    assert isinstance(raw, dict) and all(isinstance(v, str) for v in raw.values()), \
        "tg-strings.ru.json must be a flat JSON object of strings"
    return raw


def load_internal_wallets():
    with open(os.path.join(CONFIG_DIR, "internal-wallets.json"), encoding="utf-8") as f:
        raw = json.load(f)
    assert isinstance(raw, list), "internal-wallets.json must be a JSON array"
    return {e["address"] for e in raw}


def sql(query):
    out = subprocess.run(
        ["docker", "exec", "apibase-postgres-1", "psql", "-U", "apibase", "-d", "apibase", "-tAF", "\x1f", "-c", query],
        capture_output=True, text=True)
    return out.stdout.strip(), out.returncode


def health():
    """Parsed /health/refund-wallet or None (balances then read 'n/a')."""
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=10) as r:
            d = json.load(r)
        return d if isinstance(d, dict) else None
    except Exception:
        return None


def dec(v):
    try:
        return Decimal(str(v))
    except (InvalidOperation, TypeError):
        return Decimal(0)


def fmt(d):
    d = dec(d)
    return f"{d:.4f}".rstrip("0").rstrip(".") if d else "0"


def kill_active():
    return os.path.exists(KILL_FILE)


def utc_day(now):
    return now.strftime("%Y-%m-%d")
