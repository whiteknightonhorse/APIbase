-- T-0553: one row per automatic refund payout (REFUND-WALLET-1026). The ledger rows of a payout
-- are moved owed -> scheduled in the same transaction that inserts the payout, before any signature.
CREATE TABLE "refund_payouts" (
  "payout_id"    UUID NOT NULL DEFAULT gen_random_uuid(),
  "rail"         TEXT NOT NULL,
  "payer"        TEXT NOT NULL,
  "amount_usd"   DECIMAL(18,6) NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'signing',
  "nonce"        TEXT,
  "tx_hash"      TEXT,
  "raw_tx"       TEXT,
  "valid_before" TIMESTAMPTZ,
  "fee_usd_est"  DECIMAL(18,8) NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "sent_at"      TIMESTAMPTZ,
  "error"        TEXT,
  CONSTRAINT "refund_payouts_pkey" PRIMARY KEY ("payout_id"),
  CONSTRAINT "refund_payouts_rail_check" CHECK ("rail" IN ('base','tempo')),
  CONSTRAINT "refund_payouts_amount_check" CHECK ("amount_usd" > 0),
  CONSTRAINT "refund_payouts_status_check" CHECK ("status" IN ('signing','signed','broadcast','sent','expired','failed'))
);
CREATE INDEX "refund_payouts_status_idx" ON "refund_payouts"("status");
CREATE INDEX "refund_payouts_sent_at_idx" ON "refund_payouts"("sent_at");
