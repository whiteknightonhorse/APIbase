-- T-01 (2026-09-05) / Fable ruling-1 (dispute 01-law-never-sell-below-cost) decision C:
-- price floor is a DIFFERENT fact from tools.upstream_cost_usd (migration 0004). Cost is a
-- measurement (NULL = not measured, never guessed). Floor is the lowest price_usd this tool
-- may legally carry, written only when it rests on a measured cost (basis='measured') or on
-- an explicit operator order to price off the documented-max fallback
-- (basis='documented_max' -- e.g. scrape.screenshot, T-01's first application). NULL floor
-- never blocks a sale, exactly like NULL upstream_cost_usd today -- populating it is a safe
-- incremental rollout, not a flag day.
--
-- Two enforcement points read this column (both additive, both a no-op while the column is
-- NULL for a given row):
--   1. src/pipeline/stages/tool-status.stage.ts failsMarginGate() -- the hot-path lock, fires
--      even if a provider-wide manual `UPDATE tools SET status='healthy'` bypasses
--      sync_tool_status()'s own status_source gate and revives a tool whose price was never
--      fixed.
--   2. scripts/autopilot/incident-engine.py sync_tool_status() -- catalog-honesty lock, a row
--      priced below its own floor is never auto-promoted to a selling status (healthy/degraded)
--      by the reconciler; demotion to unavailable is never blocked.
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "price_floor_usd" DECIMAL(18,8);
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "price_floor_basis" TEXT;
