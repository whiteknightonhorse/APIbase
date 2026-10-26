#!/bin/bash
# T-0581: shared by every shell creator of operational GitHub issues (sourced).
# OPS_ISSUES_REPO is the one target; ops_redact scrubs host details from a body (stdin -> stdout).
OPS_ISSUES_REPO="${OPS_ISSUES_REPO:-whiteknightonhorse/apibase-internal}"
_OPS_ISSUES_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ops_redact() {
  python3 -I "$_OPS_ISSUES_LIB_DIR/../autopilot/ops_issues.py"
}
