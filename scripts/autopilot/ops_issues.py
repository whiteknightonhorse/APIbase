"""T-0581: single target repo for operational GitHub issues plus the shared body scrubber.

Operational issues (orchestra, autopilot, tester, health, margin, limits) go to the private
repository; public APIbase issues are for users. Override with OPS_ISSUES_REPO (selftests use a dummy).
"""
import json
import os
import re
import sys

OPS_ISSUES_REPO = os.environ.get("OPS_ISSUES_REPO") or "whiteknightonhorse/apibase-internal"
REDACT_PATH = os.environ.get("OPS_REDACT_CONFIG") or os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "config", "autopilot", "redact.json")
)


def redact(text):
    """Replace server IPv4, home paths and other tenants' process names. Fail-closed: a missing or
    unreadable list raises instead of letting an unscrubbed body out."""
    if not isinstance(text, str):
        return text
    with open(REDACT_PATH, encoding="utf-8") as fh:
        cfg = json.load(fh)
    rep = cfg.get("replacement", "<redacted>")
    for lit in cfg.get("literals", []):
        text = text.replace(lit, rep)
    for rx in cfg.get("regexes", []):
        text = re.sub(rx, rep, text)
    return text


def scrub_gh_args(args):
    """Return gh CLI args with the --body value scrubbed (only for issue create/comment/edit)."""
    args = list(args)
    if args[:1] == ["issue"] and len(args) > 1 and args[1] in ("create", "comment", "edit") and "--body" in args:
        i = args.index("--body") + 1
        if i < len(args):
            args[i] = redact(args[i])
    return args


if __name__ == "__main__":
    sys.stdout.write(redact(sys.stdin.read()))
