-- T-INT-23: refunds verified on-chain, buyer disputes, merchant reputation.
-- shop_refunds / shop_disputes already exist (0025 / 0026); this adds the columns the verifier and the
-- dispute lifecycle write, and one open dispute per order.
ALTER TABLE "shop_refunds" ADD COLUMN "reject_reason" TEXT;
ALTER TABLE "shop_refunds" ADD COLUMN "verified_at" TIMESTAMPTZ;
ALTER TABLE "shop_disputes" ADD COLUMN "resolved_at" TIMESTAMPTZ;

-- A refund transaction can settle exactly one refund record, whatever the order.
CREATE UNIQUE INDEX "shop_refunds_verified_tx_key" ON "shop_refunds" (lower("tx_hash")) WHERE "verified";
CREATE UNIQUE INDEX "shop_disputes_one_open_key" ON "shop_disputes" ("order_id")
    WHERE "status" IN ('open', 'merchant_responded');
