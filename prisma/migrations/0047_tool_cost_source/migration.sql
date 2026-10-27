-- T-0583 (AUDIT-OPUS-1028 A3-03): provenance of tools.upstream_cost_usd.
-- NULL cost_source = the cost was recorded or measured by a human (config/tool_provider_config.yaml)
-- or is not known at all (upstream_cost_usd NULL). 'provider-limits:free' = a zero DERIVED by
-- scripts/pricing/derive-upstream-cost.ts because the provider's plan in provider-limits.json is free
-- with no paid tier. A reader can therefore tell a derived zero from a measured zero.
-- Additive and nullable: no behaviour change for the margin gate (NULL still never blocks).
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "cost_source" TEXT;
