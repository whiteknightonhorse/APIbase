#!/usr/bin/env python3
"""backfill-upstream-cost.py -- T-0352: record upstream_cost_usd "0" explicitly for free providers.

A provider counts as FREE only on positive evidence from night-orchestra's connected.json
(status "connected", or key_required false) AND no sign of money in src/config/provider-limits.json
(no billing / paid_balance / balance_api / pricing_check block). Every other tool row that still
has no upstream_cost_usd is listed as UNKNOWN for the operator -- never guessed.

Only cost fields are touched; price_usd is never edited. Dry run by default.
Usage: python3 scripts/backfill-upstream-cost.py [--apply]
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
YAML_PATH = ROOT / "config" / "tool_provider_config.yaml"
LIMITS_PATH = ROOT / "src" / "config" / "provider-limits.json"
CONNECTED_PATH = ROOT / "scripts" / "night-orchestra" / "state" / "connected.json"
MONEY_KEYS = ("billing", "paid_balance", "balance_api", "pricing_check")

BLOCK_RE = re.compile(r"(?P<block>  - tool_id: [^\n]+\n(?:    [^\n]+\n)*)")


def free_providers(connected, limits):
    out = set()
    for name, meta in connected.items():
        if meta.get("status") != "connected" and meta.get("key_required") is not False:
            continue
        if any(k in limits.get(name, {}) for k in MONEY_KEYS):
            continue
        out.add(name)
    return out


def field(block, key):
    m = re.search(rf"^    {key}: \"?([^\"\n]*)\"?\s*$", block, re.M)
    return m.group(1).strip() if m else None


def plan(text, free):
    """Returns (new_text, zeroed_tool_ids, unknown {provider: [tool_id]})."""
    zeroed, unknown = [], {}

    def repl(m):
        block = m.group("block")
        if "    upstream_cost_usd:" in block:
            return block
        provider = field(block, "provider")
        tool_id = re.match(r"  - tool_id: (\S+)", block).group(1)
        try:
            paid = float(field(block, "price_usd") or 0) > 0
        except ValueError:
            paid = True
        if provider in free:
            zeroed.append(tool_id)
            return re.sub(r"(    price_usd: [^\n]+\n)", r'\1    upstream_cost_usd: "0"\n', block, count=1)
        if paid:
            unknown.setdefault(provider, []).append(tool_id)
        return block

    return BLOCK_RE.sub(repl, text), zeroed, unknown


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    free = free_providers(json.loads(CONNECTED_PATH.read_text()), json.loads(LIMITS_PATH.read_text()))
    text = YAML_PATH.read_text()
    new_text, zeroed, unknown = plan(text, free)
    print(f"free providers (evidence: connected.json, no billing block): {len(free)}")
    print(f"tools that would get upstream_cost_usd 0: {len(zeroed)}")
    n_unknown = sum(len(v) for v in unknown.values())
    print(f"paid tools still without a cost model: {n_unknown} across {len(unknown)} provider(s)")
    for p in sorted(unknown):
        print(f"  UNKNOWN {p}: {len(unknown[p])} tool(s)")
    if args.apply:
        YAML_PATH.write_text(new_text)
        print(f"APPLIED to {YAML_PATH}")
    else:
        print("dry run -- pass --apply to write")
    return 0


if __name__ == "__main__":
    sys.exit(main())
