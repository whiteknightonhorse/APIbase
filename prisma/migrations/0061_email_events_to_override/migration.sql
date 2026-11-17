-- T-0890: an outbound notice that must reach an address other than the shop's current contact_email
-- (contact_changed goes to the PREVIOUS address). Out + queued only: the trigger clears the column as soon
-- as the row leaves 'queued' (sent, failed, skipped), so the previous address is not retained.
ALTER TABLE "email_events" ADD COLUMN IF NOT EXISTS "to_override" TEXT;

CREATE OR REPLACE FUNCTION email_events_clear_to_override() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'queued' THEN
    NEW.to_override := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_events_clear_to_override ON "email_events";
CREATE TRIGGER email_events_clear_to_override
  BEFORE UPDATE ON "email_events"
  FOR EACH ROW EXECUTE FUNCTION email_events_clear_to_override();

-- Rollback (manual; this tree has no down-migration files):
--   DROP TRIGGER IF EXISTS email_events_clear_to_override ON "email_events";
--   DROP FUNCTION IF EXISTS email_events_clear_to_override();
--   ALTER TABLE "email_events" DROP COLUMN IF EXISTS "to_override";
