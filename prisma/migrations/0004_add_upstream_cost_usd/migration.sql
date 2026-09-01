-- F1/C-4 (2026-09-01): upstream_cost_usd for the runtime margin gate.
-- Additive, nullable — NULL means "not yet migrated" (see config/tool_provider_config.yaml
-- comment + scripts/migrate-upstream-cost.py). The TOOL_STATUS stage only enforces
-- price_usd >= upstream_cost_usd * 1.3 for rows where this is NOT NULL, so populating it
-- is a safe, incremental rollout (ceiling: 50 providers reviewed per pass) rather than a
-- flag day. 0 is a real, evidence-backed value (provider-limits.json limit_type=unlimited,
-- each with its own limit_proof) — never a placeholder for "unknown".
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "upstream_cost_usd" DECIMAL(18,8);
