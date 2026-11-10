-- T-0753: outbound email_events gain status 'skipped' = a row that was never sent on purpose (stale, resolved,
-- already in force, merchant missing, digest already sent); it is never an incident.
ALTER TABLE "email_events" DROP CONSTRAINT IF EXISTS "email_events_out_status_check";
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_out_status_check" CHECK (("direction" = 'in' AND "status" IS NULL) OR ("direction" = 'out' AND "status" IN ('queued', 'sent', 'failed', 'skipped')));
