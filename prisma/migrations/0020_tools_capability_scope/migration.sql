-- T-0207 (2026-09-22, ZZ-03-07): advisory alternatives-routing registry.
--
-- Adds two nullable columns for the "declared equivalence + advisory routing" mechanism
-- (zz-03-apibase-design.q-2.ruling-1.md, variant D / R2 / P1): `capability` groups
-- functionally-equivalent tools across providers (e.g. weather.current), `scope` says whether
-- a tool covers the whole world ('global') or one region ('regional:<CODE>') so a regional
-- tool is never suggested as an alternative for a global request and vice versa.
--
-- No backfill here: scripts/seed.ts backfills both columns from
-- config/tool_provider_config.yaml's new `capability`/`scope` YAML keys on every seed run (the
-- YAML is the single source of truth — same pattern migration 0017 used for category/namespace,
-- except that migration backfilled at migration time because it had no other source of truth
-- yet). NULL on both = "not part of a declared capability group" for every tool until the next
-- seed runs, which is correct today: nothing has been marked yet.
--
-- `same_upstream_as` (declares two tool_ids hit the identical upstream endpoint, e.g.
-- finance.ecb_rates / frankfurter.latest both proxying api.frankfurter.app) gets NO column —
-- it is an exclusion list read straight from the YAML by
-- src/services/capability-registry.service.ts at runtime, never mirrored into SQL.

ALTER TABLE "tools" ADD COLUMN "capability" TEXT;
ALTER TABLE "tools" ADD COLUMN "scope" TEXT;
