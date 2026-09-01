#!/usr/bin/env python3
"""migrate-upstream-cost.py — F1/C-4 bounded migration of upstream_cost_usd into
config/tool_provider_config.yaml, one reviewable pass at a time.

ONLY handles the evidence-backed case: providers whose src/config/provider-limits.json
limit_type is "unlimited" (no documented rate limit, each with its own limit_proof
string already written down by whoever classified it) get upstream_cost_usd: "0" — a
real number, not a guess. Providers with a finite free tier (daily/monthly/hourly/
credits/trial/rate_limited) are NOT touched here: what they cost past the free tier is
a real per-provider research question (pricing page, contract) that this script must
never invent an answer for. Do those by hand, one at a time, sourced.

Ceiling: 50 providers per invocation, hard-coded, refuses more (LAW: a mass edit needs
a ceiling). Progress is tracked by re-scanning the YAML itself (idempotent — a provider
already carrying upstream_cost_usd on ALL its tool rows is skipped), so re-running is
safe and picks up where the last pass left off.

Usage: python3 migrate-upstream-cost.py [--apply] [--limit N]
  (no --apply : dry run, prints the planned diff only)
"""
import re
import sys
import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] if (Path(__file__).resolve().parent.name == "night-orchestra") else Path("/home/apibase/apibase")
YAML_PATH = ROOT / "config" / "tool_provider_config.yaml"
LIMITS_PATH = ROOT / "src" / "config" / "provider-limits.json"
HARD_CEILING = 50

TOOL_BLOCK_RE = re.compile(
    r"(  - tool_id: [^\n]+\n"
    r"(?:    [^\n]+\n)*?"
    r"    provider: (?P<provider>[^\n]+)\n"
    r"(?:    [^\n]+\n)*?"
    r"    price_usd: [^\n]+\n)"
    r"(?P<rest>(?:    [^\n]+\n)*)",
)


def load_unlimited_providers() -> set[str]:
    cfg = json.loads(LIMITS_PATH.read_text())
    return {name for name, meta in cfg.items() if meta.get("limit_type") == "unlimited"}


def plan(text: str, unlimited: set[str], limit: int):
    """Returns (new_text, touched_providers, touched_tool_rows)."""
    touched_providers: set[str] = set()
    touched_rows = 0
    out = []
    pos = 0

    for m in TOOL_BLOCK_RE.finditer(text):
        out.append(text[pos:m.start()])
        block, rest, provider = m.group(1), m.group("rest"), m.group("provider").strip()

        already_has = "upstream_cost_usd:" in rest
        eligible = provider in unlimited and not already_has

        if eligible and (len(touched_providers) < limit or provider in touched_providers):
            block = block + '    upstream_cost_usd: "0"\n'
            touched_providers.add(provider)
            touched_rows += 1

        out.append(block)
        out.append(rest)
        pos = m.end()

    out.append(text[pos:])
    return "".join(out), touched_providers, touched_rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the file (default: dry run)")
    ap.add_argument("--limit", type=int, default=HARD_CEILING)
    args = ap.parse_args()

    if args.limit > HARD_CEILING:
        print(f"REFUSED: --limit {args.limit} exceeds hard ceiling {HARD_CEILING}", file=sys.stderr)
        sys.exit(2)

    unlimited = load_unlimited_providers()
    text = YAML_PATH.read_text()
    new_text, providers, rows = plan(text, unlimited, args.limit)

    print(f"Providers touched this pass: {len(providers)} (limit {args.limit})")
    print(f"Tool rows getting upstream_cost_usd=\"0\": {rows}")
    for p in sorted(providers):
        print(f"  - {p}")

    if not args.apply:
        print("\nDry run — pass --apply to write. Re-run afterwards with no args to see what's left.")
        return

    YAML_PATH.write_text(new_text)
    print(f"\nWrote {YAML_PATH}")


if __name__ == "__main__":
    main()
