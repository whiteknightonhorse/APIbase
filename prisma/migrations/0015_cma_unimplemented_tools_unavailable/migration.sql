-- T-09b (2026-09-06): cma.artwork_search, cma.artwork_detail, cma.creator_search and
-- cma.exhibition_search were registered in tool-definitions.ts (a later addition on top of
-- UC-381's original cma.search/cma.artwork pair) but src/adapters/cma/index.ts's
-- buildRequest/parseResponse switches never gained matching cases for them. Every call to
-- any of the 4 hits the switch's default branch -- "Unsupported tool: cma.artwork_search"
-- etc, a 100%-failure-rate catalog/adapter mismatch, not a flaky upstream (heartbeat-bot
-- 502s traced in AUTOPILOT-PROGRESS.md#T-09b). Unlike the cernopendata/clinicaltrials
-- mismatches this same task fixes by aliasing (real, working functionality just under the
-- wrong toolId), these 4 have no working implementation to alias to at all: the Cleveland
-- Museum of Art Open Access API (openaccess-api.clevelandart.org) that cma.search/
-- cma.artwork already call has no separate creator-search or exhibition-search endpoint,
-- and no accession-number lookup distinct from the numeric artwork_id cma.artwork already
-- uses -- building real support for these is genuine feature work, out of scope for a
-- heartbeat-5xx-classification task, and not something this migration invents.
--
-- Marked unavailable with status_source='manual' rather than left healthy-but-broken (the
-- "статус и реальность разошлись" defect this whole task exists to close) or silently
-- dropped from the catalog. status_source='manual' is the documented, permanent way to keep
-- sync_tool_status()'s autopilot reconciler (scripts/autopilot/incident-engine.py) from ever
-- reviving these rows back to 'healthy' off cma's overall provider_status -- cma.search and
-- cma.artwork work fine and will keep reporting the PROVIDER healthy, which would otherwise
-- promote these right back (see incident-engine.py's own "status_source LAW: manual status
-- is never overwritten", the same mechanism that has held the 3 zyte scrape.* rows since
-- 2026-06-06, migration 0014's comment). This is a per-tool defect, not a per-provider one --
-- routing it through provider_status/sync_tool_status (per-provider granularity) would
-- incorrectly drag cma.search/cma.artwork down too the next time either of these 4 gets
-- called, which is exactly the trap this migration avoids.
--
-- Reverting this (once a real implementation ships) is a normal status_source='manual'
-- promotion: `UPDATE tools SET status='healthy', status_source='manual',
-- status_reason='<why>' WHERE tool_id = '...'` -- the audit trigger (migration 0014) requires
-- exactly that shape already.
UPDATE tools
SET status = 'unavailable',
    status_source = 'manual',
    status_reason = 'T-09b: adapter has no implementation for this tool_id (catalog entry added without matching adapter case — see src/adapters/cma/index.ts default branch)'
WHERE tool_id IN ('cma.artwork_search', 'cma.artwork_detail', 'cma.creator_search', 'cma.exhibition_search')
  AND status <> 'unavailable';
