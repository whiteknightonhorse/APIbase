# Security & Correctness Audit — September 2026 Round

Findings from the audit round referenced in the v1.6.0 release notes. Each item below is a
real commit on `main`, not a description — traced from `git log v1.5.0..HEAD` by its own
`(F<N>)` commit-message tag. This doc exists because the release notes point to it instead of
re-explaining each fix inline.

**Disclosed gap:** the operator's own count for this round is 13 findings. This document lists
the 11 distinct `F<N>` numbers this pass could trace to a real commit under that exact tag
(F5 covers five separate sub-commits, all part of the same physical-device-layer finding).
F10 and F12 were not found under that tag in `git log v1.5.0..HEAD --oneline -i | grep -E
"F-?10\b|F-?12\b"` — either they were fixed under different commit-message phrasing, or the
round's numbering has gaps. Not fabricated to force the count to 13.

| # | Fix | Commit |
|---|-----|--------|
| F1 | Idempotency finalize + single-flight lock liveness + honest batch 402; partition-cleanup cron registered; spend-vs-revenue discrepancy alert; adversarial end-to-end sweep across `/execute`, `/batch`, `/mcp`; CI check blocking adapter imports outside the pipeline | d3da880, a4c5349, 06ea175, 5a0c623, 4c4e839 |
| F2 | `deploy.sh` now checks out the exact SHA, refuses on a dirty tree, and defers the static-asset switch until after the smoke test; `static-releases/` retention added so it doesn't grow unbounded | af0aba5, cdf6bdd |
| F3 | Closed an adapter-import-boundary violation in `device-connect.router.ts`; Security Audit workflow now also runs on `ci-staging` push, not just `main` | 5523d03, 407d677 |
| F4 | Removed a fossil root-level `mcp.json` that no longer matched the served one | c78474c |
| F5 | Physical-device MCP layer (Tuya OAuth account linking, T1 scope): device-connect router added to the fuzz gate and hardened callback handler, nginx location for `/connect/device/*`, `device.list` gets a described vendor filter param, starter example fixed to call a real `tool_id` | 600d10a, a9709f9, ba2e84b, 8cd4a9f, 4b542dc |
| F6 | Margin multiplier existed as two independent hardcoded `1.3` literals — unified to one source | 1d83000 |
| F7 | Logger redaction was missing `token`/`secret`/`password` fields entirely | 66f2ccd |
| F8 | Removed `--passWithNoTests` from both Jest CI invocations (a suite with 0 tests was reporting green) | 33dd0fb |
| F9 | Wired `sync-counts.sh --check` to CI — it existed but was called from nowhere | 0a7c0da |
| F11 | Unclassified physical-device commands now fail closed and require `confirm:true`, same as a known `confirm_required` class (Fable ruling: no verb-allowlist — Tuya's own command vocabulary, not something this repo controls) | bdddcae |
| F13 | Pricing copy, pipeline stage-count docstrings, and a stale runbook marker corrected | 0773e6d |

See also, same round: MODERATION pipeline stage (14th stage — content moderation as a first-
class, fail-closed pipeline step rather than one adapter's inline check), the redesign cycles
(F6 "redesign", a separate F-series from the margin-multiplier F6 above — nav tap targets,
mobile table overflow, boot-screen/sys-monitor parity), and the `docs/09-device-mcp-layer.md`
design document these F5 commits implement against.
