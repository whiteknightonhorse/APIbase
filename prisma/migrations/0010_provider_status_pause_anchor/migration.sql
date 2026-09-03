-- AP-3 review fix (Fable, attempt 1 of 812-autopilot-probe-v2, 2026-09-03).
--
-- REJECT reason being fixed: the FAIL_DETERMINISTIC ("401 — zero retries") pause
-- was keyed on provider_status.last_probe_result + next_probe_at. Those same two
-- columns are ALSO written by tool-quality.job.ts's passive step (real traffic
-- feeding the same state machine, kind='passive') every ~10 minutes for any
-- provider with enough call volume. One field, two meanings — "result of the
-- last ACTIVE probe" vs "result of the last live traffic observation" — so an
-- active auth-probe's 24h pause was getting silently overwritten by the passive
-- step within one tick, and the deterministically-impossible call got retried
-- anyway. Fable's ruling: split the meanings, don't reorder the writes.
--
-- This column is the durable pause anchor, on its own: written ONLY by an
-- active (non-passive) FAIL_DETERMINISTIC result, cleared ONLY by another
-- active result. The passive step never touches it — see recordProbeResult
-- in src/jobs/provider-health.job.ts.
ALTER TABLE "provider_status"
  ADD COLUMN IF NOT EXISTS "deterministic_paused_until" TIMESTAMPTZ;
