-- T-0551: one refund-owed ledger for Base x402 and Tempo MPP (REFUND-WALLET-1026 ruling-1).
-- This table only RECORDS debts; the refund payout job (0553) pays them.
CREATE TABLE "refund_ledger" (
  "refund_id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "rail"             TEXT NOT NULL,
  "payer"            TEXT NOT NULL,
  "amount_usd"       DECIMAL(18,6) NOT NULL,
  "reason"           TEXT NOT NULL,
  "source_kind"      TEXT NOT NULL,
  "source_id"        TEXT NOT NULL,
  "receipt_id"       TEXT,
  "order_id"         UUID,
  "payment_id"       UUID,
  "original_tx"      TEXT,
  "status"           TEXT NOT NULL DEFAULT 'owed',
  "payout_id"        UUID,
  "refund_tx"        TEXT,
  "detected_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "sent_at"          TIMESTAMPTZ,
  "cancelled_reason" TEXT,
  "note"             JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "refund_ledger_pkey" PRIMARY KEY ("refund_id"),
  CONSTRAINT "refund_ledger_rail_check" CHECK ("rail" IN ('base','tempo')),
  CONSTRAINT "refund_ledger_amount_check" CHECK ("amount_usd" > 0),
  CONSTRAINT "refund_ledger_source_kind_check" CHECK ("source_kind" IN ('receipt','order','request')),
  CONSTRAINT "refund_ledger_status_check" CHECK ("status" IN ('owed','internal','scheduled','sent','cancelled'))
);
CREATE UNIQUE INDEX "refund_ledger_source_reason_key" ON "refund_ledger"("source_kind","source_id","reason");
CREATE INDEX "refund_ledger_status_rail_payer_idx" ON "refund_ledger"("status","rail","payer");
CREATE INDEX "refund_ledger_receipt_id_idx" ON "refund_ledger"("receipt_id");
CREATE INDEX "refund_ledger_order_id_idx" ON "refund_ledger"("order_id");

ALTER TABLE "shop_payments" ADD COLUMN "valid_before" TIMESTAMPTZ;
ALTER TABLE "shop_refunds" ADD COLUMN "refund_to" TEXT;
