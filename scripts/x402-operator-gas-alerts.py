#!/usr/bin/env python3
"""x402-operator-gas-alerts.py - warn on Telegram before the x402 operator gas wallet
reaches the min-balance floor (APIBASE-AUDIT-1012 q-16 ruling F4).

The operator wallet pays gas for every x402 local settle. Prometheus
X402OperatorWalletLowBalance fires only below the floor and routes to `blackhole`, so
nothing reached the operator before settles started failing. This reads the Redis hash
x402:operator (written hourly by src/jobs/x402-health.job.ts) and pages Telegram
(state/tg.env, same bot/chat as x402-settle-leak-alerts.py) in two tiers:
  balance < min            -> RED,    at most once per 4 h
  min <= balance < warn    -> ORANGE, at most once per 24 h
  otherwise                -> OK, nothing sent
warn defaults to 3 * min when the hash has no warn_balance_eth. A tier change resets
pacing. If last_check is older than 3 h the balance is not trusted: one
"probe stale" message per 24 h instead.

Runs hourly from cron. Exit 0 on OK/sent, 1 on read failure.
  --dry-run          print decision and message, send nothing, write no state
  --hash-json '<j>'  use this JSON instead of the docker/redis read
"""
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

ROOT = "/home/apibase/apibase"
STATE = f"{ROOT}/scripts/night-orchestra/state"
STATE_FILE = f"{STATE}/x402-operator-gas.json"
# Redis container name; find with: docker ps --format '{{.Names}}' | grep redis
REDIS_CONTAINER = "apibase-redis-1"
WALLET_SHORT = "0x54F0...7932"
STALE_AFTER_S = 3 * 3600
PACING_S = {"RED": 4 * 3600, "ORANGE": 24 * 3600, "STALE": 24 * 3600}


def load_tg_env():
    env = {}
    path = f"{STATE}/tg.env"
    if not os.path.exists(path):
        return env
    for line in open(path):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k] = v.strip('"').strip("'")
    return env


def parse_ts(s):
    d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def iso(d):
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_hash():
    r = subprocess.run(["docker", "exec", REDIS_CONTAINER, "redis-cli", "HGETALL", "x402:operator"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("redis-cli failed: " + r.stderr.strip())
    items = r.stdout.splitlines()
    return dict(zip(items[0::2], items[1::2]))


def load_state():
    try:
        with open(STATE_FILE) as f:
            s = json.load(f)
        return s if isinstance(s, dict) else {}
    except (OSError, ValueError):
        return {}


def save_state(state):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, STATE_FILE)


def send(text):
    tg = load_tg_env()
    bot, chat_id = tg.get("TG_BOT_TOKEN"), tg.get("TG_CHAT_ID")
    if not (bot and chat_id):
        return False
    r = subprocess.run(
        ["curl", "-sS", "--max-time", "30", "-F", f"chat_id={chat_id}", "-F", f"text={text}",
         f"https://api.telegram.org/bot{bot}/sendMessage"],
        capture_output=True, text=True,
    )
    return '"ok":true' in r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--hash-json")
    args = ap.parse_args()
    now = datetime.now(timezone.utc)

    try:
        h = json.loads(args.hash_json) if args.hash_json is not None else read_hash()
        balance = float(h["balance_eth"])
        floor = float(h["min_balance_eth"])
        warn = float(h["warn_balance_eth"]) if h.get("warn_balance_eth") else 3 * floor
        last_check = h["last_check"]
        age_s = (now - parse_ts(last_check)).total_seconds()
    except (KeyError, ValueError, TypeError, RuntimeError, OSError) as e:
        print(f"x402-operator-gas-alerts: read failed: {e}")
        return 1

    state = load_state()
    new_state = dict(state)
    text = None
    if age_s > STALE_AFTER_S:
        tier = "STALE"
        text = (f"x402 operator gas wallet {WALLET_SHORT}: balance probe stale since {last_check}. "
                f"Dashboard: https://apibase.pro/dashboard")
    else:
        tier = "RED" if balance < floor else "ORANGE" if balance < warn else "OK"
        if tier != "OK":
            limit = floor if tier == "RED" else warn
            tail = f"Floor {floor:g} ETH"
            try:
                prev = float(state["last_balance_eth"])
                dt_days = (now - parse_ts(state["last_balance_at"])).total_seconds() / 86400
                if dt_days > 0 and balance < prev:
                    per_day = (prev - balance) / dt_days
                    tail += f"; ~{max(balance - floor, 0) / per_day:.1f} days left at {per_day:.4f} ETH/day"
            except (KeyError, ValueError, TypeError):
                pass
            text = (f"x402 operator gas wallet {WALLET_SHORT}: {balance:g} ETH is below {limit:g} ({tier}). "
                    f"{tail}. Top up on Base mainnet. Dashboard: https://apibase.pro/dashboard")
        new_state.update(last_balance_eth=balance, last_balance_at=iso(now))

    due = False
    if text:
        due = state.get("last_tier") != tier
        if not due:
            try:
                due = (now - parse_ts(state["last_sent_at"])).total_seconds() >= PACING_S[tier]
            except (KeyError, ValueError, TypeError):
                due = True

    print(f"x402-operator-gas-alerts: tier={tier} balance={balance:g} floor={floor:g} warn={warn:g} "
          f"send={'yes' if due else 'no'}")
    if due:
        print(text)
    if args.dry_run:
        return 0

    if tier == "OK":
        new_state["last_tier"] = "OK"
    if due:
        if send(text):
            new_state.update(last_sent_at=iso(now), last_tier=tier)
        else:
            print("x402-operator-gas-alerts: Telegram send FAILED, will retry next tick")
    save_state(new_state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
