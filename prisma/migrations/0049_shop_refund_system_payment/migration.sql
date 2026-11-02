-- T-0656: a system refund request (duplicate_payment / paid_after_terminal) points at the payment it
-- is about; one open system request per (payment, reason). Additive; older rows stay NULL.
ALTER TABLE "shop_refunds" ADD COLUMN "payment_id" UUID;
CREATE UNIQUE INDEX "shop_refunds_system_payment_key" ON "shop_refunds" ("payment_id", "reason")
  WHERE "requested_by" = 'system' AND "payment_id" IS NOT NULL;
