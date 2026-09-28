-- T-0219 (2026-09-28, per taskloop/disputes/OW-attribution.ruling-1.md, Fable ruling-1,
-- operator decision "Б — пометить 5 инструментов как unavailable"): 5 of the 7 catalog
-- tool_ids under provider openweathermap were shown healthy but have no adapter
-- implementation. src/adapters/openweathermap/index.ts:38-52 only handles
-- weather.get_current and weather.get_forecast; every other tool_id falls into the
-- adapter's default branch and returns 502 "Unsupported tool" *after* ESCROW -- the
-- calling agent pays, gets a 502, and is refunded. The catalog, OpenAPI and
-- /api/v1/tools/:tool_id all reported these as healthy with provider score 100, so an
-- agent has no way to see the failure coming before paying.
--
-- The operator-approved fix is the documented status_source='manual' pattern from
-- migration 0015 (cma.*) and 0019 (gdelt.*): mark the 5 broken tool_ids unavailable so
-- they drop out of every status != 'unavailable' catalog/MCP/discovery filter
-- (src/services/tool-registry.service.ts, scripts/gen-catalog-page.ts,
-- scripts/gen-discovery.ts, scripts/generate-openapi.ts), while leaving the yaml/OpenAPI/
-- server-card entries in place -- full removal is blocked by the tatoeba precedent
-- (T-9526/T-9567: status='unavailable' is itself the documented "live tool_id with no
-- working implementation" marker, not something to delete). status_source='manual' keeps
-- sync_tool_status()'s autopilot reconciler (scripts/autopilot/incident-engine.py) from
-- reviving these rows off the openweathermap provider's overall health -- weather.get_current
-- and weather.get_forecast are real, working adapter cases and will keep reporting the
-- PROVIDER healthy, which would otherwise auto-promote these 5 right back (status_source
-- LAW, migration 0014's comment). This is a per-tool defect, not a per-provider one.
--
-- The other branch considered ("реализовать через One Call 3.0") was rejected by the
-- operator as a paid-plan dependency, out of scope here.
--
-- Reverting this (once real adapter support ships) is a normal status_source='manual'
-- promotion: `UPDATE tools SET status='healthy', status_source='manual',
-- status_reason='<why>' WHERE tool_id = '...'` -- the audit trigger (migration 0014)
-- requires exactly that shape already.
UPDATE tools
SET status = 'unavailable',
    status_source = 'manual',
    status_reason = 'T-0219: adapter not implemented (One Call 3.0 required) — src/adapters/openweathermap/index.ts default branch returns 502 after ESCROW'
WHERE tool_id IN ('weather.get_alerts', 'weather.get_history', 'weather.air_quality', 'weather.geocode', 'weather.compare')
  AND status <> 'unavailable';
