-- A-GD-01 (GENLAYER-DISPUTE-1102 ruling-1): state of the dispute verdict worker. The refund_ledger
-- stays the only record of a debt (REFUND-WALLET-1026); these tables only remember what the worker
-- has already filed or judged, so a restart never files twice and never repeats an incident.

-- One row per claim APIbase filed on the dispute contract. The flag line and its timestamp are
-- written BEFORE the filing transaction (the honesty rule: the case comes from our own watcher).
CREATE TABLE "dispute_flags" (
  "flag_id"      UUID NOT NULL DEFAULT gen_random_uuid(),
  "claim"        TEXT NOT NULL,
  "subject"      TEXT NOT NULL,
  "flag_line"    TEXT NOT NULL,
  "flagged_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "filed_tx"     TEXT,
  "filed_at"     TIMESTAMPTZ,
  "error"        TEXT,
  CONSTRAINT "dispute_flags_pkey" PRIMARY KEY ("flag_id"),
  CONSTRAINT "dispute_flags_claim_check" CHECK ("claim" IN ('upstream_failed_but_billed','paid_without_receipt'))
);
CREATE UNIQUE INDEX "dispute_flags_claim_subject_key" ON "dispute_flags"("claim","subject");

-- One row per dispute id the worker has judged. `outcome` is final except 'booked', whose
-- confirm_refund step is tracked in confirm_state.
CREATE TABLE "dispute_verdicts" (
  "dispute_id"    TEXT NOT NULL,
  "claim"         TEXT NOT NULL,
  "verdict"       TEXT NOT NULL,
  "payment_tx"    TEXT,
  "receipt_id"    TEXT,
  "outcome"       TEXT NOT NULL,
  "detail"        JSONB NOT NULL DEFAULT '{}',
  "refund_id"     UUID,
  "confirm_state" TEXT NOT NULL DEFAULT 'none',
  "judged_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "dispute_verdicts_pkey" PRIMARY KEY ("dispute_id"),
  CONSTRAINT "dispute_verdicts_outcome_check" CHECK ("outcome" IN
    ('released','booked','mismatch','over_cap','duplicate_tx','unreadable')),
  CONSTRAINT "dispute_verdicts_confirm_check" CHECK ("confirm_state" IN ('none','pending','done','failed'))
);

-- by-tx lookups: public_receipts.body is TEXT; the expression index serves GET /r/by-tx/<tx>.json.
CREATE INDEX "public_receipts_payment_tx_idx" ON "public_receipts" ((("body")::jsonb ->> 'payment_tx'));
-- one refund per payment transaction, ever: the worker looks refund_ledger up by original_tx.
CREATE INDEX "refund_ledger_original_tx_idx" ON "refund_ledger"("original_tx");
