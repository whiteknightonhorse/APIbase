#!/usr/bin/env python3
"""check-adapter-import-boundary.py — F1 closing requirement: "no adapter
imported outside pipeline/tests".

WHY: PROVIDER_CALL is the one pipeline stage that resolves and invokes an
adapter (src/pipeline/stages/provider-call.stage.ts, via
src/adapters/registry.ts). F0's audit found exactly one place outside that
path importing an adapter directly -- telegram's content-filter call sat
inside TelegramAdapter itself, calling out mid-adapter instead of at a
pipeline stage boundary, which is HOW the moderation gap (372 adapters,
exactly 1 filtered) stayed invisible. This check makes "no adapter class
imported outside pipeline/tests" a standing, automated invariant instead of
something only found by a one-off manual audit.

ALLOWED:
  - src/adapters/**   (adapters composing/importing each other)
  - src/pipeline/**   (provider-call.stage.ts resolving adapters)
  - tests/**          (unit tests importing adapters directly)
  - `import type { ... } from '.../adapters/.../types'` anywhere -- a
    type-only import is erased at compile time, zero runtime footprint,
    cannot invoke a provider call. batch.service.ts / batch.router.ts / the
    normalizers legitimately do this for shared request/response shapes.
    A plain grep on the line containing "from" misses this when the import
    spans multiple lines (the "import type" keyword is on an earlier line) --
    this script joins each import statement (from "import" to the closing
    ";") before checking, so multi-line type-only imports are not
    misclassified as violations.

BLOCKED: any *value* import reaching into src/adapters/** from outside
src/adapters/**, src/pipeline/**, or tests/** -- a real adapter
class/instance/function becoming callable from somewhere PROVIDER_CALL, and
by extension ESCROW/the future MODERATION stage, never see.

Exit 0 = clean, exit 1 = violations printed.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
ADAPTERS_PREFIX = "adapters/"

IMPORT_STATEMENT_RE = re.compile(r"import\s+(type\s+)?.*?from\s+['\"]([^'\"]+)['\"]\s*;?", re.S)


def find_violations(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    violations = []
    for m in IMPORT_STATEMENT_RE.finditer(text):
        is_type_only = m.group(1) is not None
        module_path = m.group(2)
        if ADAPTERS_PREFIX not in module_path:
            continue
        if is_type_only:
            continue
        line_no = text.count("\n", 0, m.start()) + 1
        snippet = " ".join(m.group(0).split())
        violations.append(f"{path}:{line_no}: {snippet}")
    return violations


def main() -> int:
    all_violations: list[str] = []
    for ts_file in SRC.rglob("*.ts"):
        rel = ts_file.relative_to(ROOT).as_posix()
        if rel.startswith("src/adapters/") or rel.startswith("src/pipeline/"):
            continue
        all_violations.extend(find_violations(ts_file))

    if all_violations:
        print(
            "check-adapter-import-boundary: BLOCKED - adapter value-imports "
            "found outside pipeline/tests:",
            file=sys.stderr,
        )
        for v in all_violations:
            print(f"  {v}", file=sys.stderr)
        print(
            "\nFix: resolve the adapter through src/adapters/registry.ts INSIDE a "
            "pipeline stage, or change the import to 'import type' if only a "
            "type/interface is needed.",
            file=sys.stderr,
        )
        return 1

    print("check-adapter-import-boundary: OK - no adapter value-import outside src/pipeline or src/adapters")
    return 0


if __name__ == "__main__":
    sys.exit(main())
