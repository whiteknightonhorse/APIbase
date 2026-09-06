-- T-04 (2026-09-06): schema.prisma's own comment on tools.status_source has said since AP-1
-- (migration 0009) "a `status` write must always set the other two [status_source,
-- status_reason] together" -- but that was prose, not enforcement. `sync_tool_status()`
-- (scripts/autopilot/incident-engine.py) honours it; a raw manual `UPDATE tools SET
-- status = ...` (the exact recipe documented in project memory for reviving a
-- suspended-account provider, and the exact way the three `zyte` `scrape.*` rows ended up
-- `unavailable` back in 2026-06-06, three months before status_source even existed) does not
-- go through that function and was never stopped from leaving status_source/status_reason
-- NULL. 28 of the current 58 `unavailable` rows (incl. all 3 zyte rows) carry that gap today
-- -- this migration does not touch those existing rows (a NULL-source non-healthy row is
-- deliberately never auto-adopted, see sync_tool_status()'s own status_source LAW), it only
-- closes the hole for every future write.
--
-- Enforced at the database level, not just in application code, because the whole point is
-- that a raw psql UPDATE -- which by definition runs outside any TypeScript/Python code path
-- -- must be unable to change `status` without recording who/why. A CHECK constraint cannot
-- express "these columns are required only when this one changes relative to its old value"
-- (that needs OLD vs NEW), hence a trigger rather than a CHECK.
--
-- Scope of the requirement, kept intentionally narrow:
--   * Fires only on UPDATE, and only when `status` itself is actually changing
--     (`IS DISTINCT FROM`, NULL-safe) -- a price/name/cache_ttl update, or a
--     `status`-unchanged no-op write, never needs a reason.
--   * Deliberately does NOT fire on INSERT. scripts/seed.ts creates every new tool as
--     'healthy' with no source (the documented safe default -- see sync_tool_status()'s own
--     status_source LAW: "NULL + status='healthy'" is "just never touched", not suspect).
--     incident-engine.py's own selftest-db fixtures also INSERT rows shaped exactly like the
--     real ~20 June-2026 legacy rows (status_source NULL, status already non-healthy) ON
--     PURPOSE, to prove sync_tool_status() never adopts them -- gating INSERT here would
--     reject that intentional legacy shape at fixture-setup time, before the actual behaviour
--     under test ever runs. The hole this migration closes is specifically the UPDATE path
--     (raw or code), which is how every one of today's 28 status_source-NULL unavailable rows
--     was actually produced.
--   * `status_changed_at` is deliberately NOT required from the caller -- it is always
--     overwritten to `now()` by this trigger on every real status change, so a stale or
--     forgotten caller-supplied timestamp can never desync the audit trail from the actual
--     commit time. `status_source`/`status_reason` ARE required from the caller (the trigger
--     cannot invent who or why) and raise if either is NULL.
CREATE OR REPLACE FUNCTION tools_require_status_audit() RETURNS trigger AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status_source IS NULL OR NEW.status_reason IS NULL THEN
            RAISE EXCEPTION
                'tools.status change requires status_source and status_reason (tool_id=%, % -> %)',
                OLD.tool_id, OLD.status, NEW.status;
        END IF;
        NEW.status_changed_at := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tools_status_audit_required ON "tools";
CREATE TRIGGER tools_status_audit_required
    BEFORE UPDATE ON "tools"
    FOR EACH ROW
    EXECUTE FUNCTION tools_require_status_audit();
