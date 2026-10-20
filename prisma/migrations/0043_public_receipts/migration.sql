-- A-GA-01: immutable public receipts, one per billed call, served at GET /r/<receipt_id>.json.
-- Write-once: the application only INSERTs; the trigger makes UPDATE and DELETE impossible even for
-- a superuser role (same mechanism as execution_ledger, 0038). Escape hatch: see docs/runbook.md.
CREATE TABLE IF NOT EXISTS "public_receipts" (
  "receipt_id" CHAR(32) PRIMARY KEY CHECK ("receipt_id" ~ '^[0-9a-f]{32}$'),
  "body"       TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public_receipts_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'public_receipts is write-once: % is not allowed (receipt_id=%)', TG_OP, OLD.receipt_id
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS public_receipts_no_change ON "public_receipts";
CREATE TRIGGER public_receipts_no_change
  BEFORE UPDATE OR DELETE ON "public_receipts"
  FOR EACH ROW EXECUTE FUNCTION public_receipts_guard();
