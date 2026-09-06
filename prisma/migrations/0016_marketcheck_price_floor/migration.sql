-- T-10 (2026-09-06): marketcheck (carmarket.search, carmarket.listing) sold below cost --
-- tools.upstream_cost_usd was NULL for both, so failsMarginGate() (tool-status.stage.ts) had
-- nothing to enforce against and never fired. Both tool_ids hit MarketCheck's Inventory
-- Search API (GET /search/car/active, GET /listing/car/{id} -- src/adapters/marketcheck/
-- index.ts), which the operator's own MarketCheck Data Fee Schedule snapshot (2026-09-06)
-- prices at $0.0080/call. We charged $0.003 (search) and $0.002 (listing) -- a $0.005-0.006
-- loss per call the moment the account leaves the 500-call/mo Free plan.
--
-- basis='measured', not 'documented_max' (unlike scrape.screenshot, migration 0013): the
-- $0.0080 figure is the provider's own published per-call rate for the exact endpoint we
-- call, not a fallback range picked because no exact rate was published.
--   floor = upstream_cost_usd 0.008 * config/margin.json MARGIN_MULTIPLIER 1.3 = 0.0104
--   0.0104 already sits on the 'measured' rounding grid (0.0001, round up, never down --
--   same convention as migration 0013's price_note) -- no further rounding needed.
-- price_usd for both tools is raised to 0.0104 in config/tool_provider_config.yaml (same
-- commit) and re-seeded; this UPDATE only records the floor + cost, guarded on IS NULL so a
-- deliberate future edit (e.g. a real measured cost replacing this price-schedule figure)
-- is never clobbered by a migration re-run.
--
-- Reconciliation against all 11 MarketCheck Data Fee Schedule line items (T-10 task item 3):
-- carmarket.search/carmarket.listing are the ONLY two tool_ids this codebase implements for
-- provider marketcheck (src/adapters/registry.ts case 'carmarket', src/adapters/marketcheck/
-- index.ts's buildRequest switch has exactly these two cases, src/mcp/tool-definitions.ts and
-- src/schemas/marketcheck.schema.ts register only these two) -- both map to Inventory Search.
-- The other 9 schedule items (Auction Inventory Search, OEM MSA Incentives, VIN History,
-- Basic VIN Decoder, Cars VINResolve $10.00/call, Cars Marketcheck Price CA USED Base, Car
-- Price Prediction, Cars MarketMatch $0.35/call, Cached Images, CRM Cleanse) have no adapter
-- case, no schema, and no tool-definitions.ts entry anywhere in this repo -- nothing is sold
-- against them, so there is no below-cost exposure to fix for those 9.
UPDATE "tools"
SET "upstream_cost_usd" = 0.0080,
    "price_floor_usd" = 0.0104,
    "price_floor_basis" = 'measured'
WHERE "tool_id" IN ('carmarket.search', 'carmarket.listing')
  AND "price_floor_usd" IS NULL;
