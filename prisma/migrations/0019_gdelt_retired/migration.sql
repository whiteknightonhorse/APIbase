-- T-0152b: gdelt.search and gdelt.timeline were already status='unavailable' (autopilot,
-- provider_status.state=DOWN, 429 rate-limited -- see AUTOPILOT-PROGRESS.md#T-0141-gdelt-is-
-- chronically-slow-and-rate-limited) but status_source='autopilot', meaning sync_tool_status()
-- would silently revive these two rows back to 'healthy' the moment provider_status.gdelt ever
-- reports HEALTHY again -- an outcome the operator's 2026-09-21 "Похоронить провайдера" decision
-- (see AUTOPILOT-PROGRESS.md#T-0152-gdelt-deprecation-assess-and-plan, ruling-1 in
-- disputes/0152-gdelt-deprecation-assess-and-plan.ruling-1.md) explicitly does not want: gdelt is
-- retired by operator choice, not by a transient provider outage that should self-heal.
--
-- This migration only flips ownership to status_source='manual', the documented, permanent way
-- to keep the autopilot reconciler (scripts/autopilot/incident-engine.py) from ever overwriting
-- these two rows again ("status_source LAW: manual status is never overwritten", migration 0014's
-- comment, same mechanism as the 3 zyte scrape.* rows since 2026-06-06 and migration 0015's cma
-- rows). Paired with T-0152a's provider-limits.json "retired" fact (probe + incident-detector
-- skip) and this task's incident-cli.py retire calls on the 3 open gdelt incidents -- together
-- the three locks ruling-1 calls for. Code (adapter, schema, tool-definitions.ts entry, T-0141's
-- regression test) is untouched: State A ("снят с каталога, код остаётся"), not State B, per
-- execution_ledger_tool_id_fkey ON DELETE RESTRICT physically preventing row deletion anyway.
--
-- Reverting this (only on an explicit operator decision to un-retire, never automatically): drop
-- the "retired" fact from provider-limits.json's gdelt block first, then
-- `UPDATE tools SET status='healthy', status_source='manual', status_reason='<why>' WHERE
-- tool_id IN ('gdelt.search', 'gdelt.timeline')` -- the audit trigger (migration 0014) requires
-- exactly that shape already.
UPDATE tools
SET status = 'unavailable',
    status_source = 'manual',
    status_reason = 'T-0152b: provider retired by operator decision 2026-09-21, see AUTOPILOT-PROGRESS.md#T-0152-gdelt-deprecation-assess-and-plan'
WHERE tool_id IN ('gdelt.search', 'gdelt.timeline')
  AND status_source <> 'manual';
