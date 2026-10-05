-- T-INT-14 (F-6): webhook delivery. One row per ATTEMPT (attempt 1, 2, ...) of an outbox event to an endpoint.
-- secret_hash stays the sha256 of the whsec_ secret (shown once); secret_enc is the same secret under the
-- server key (secret-crypto) because HMAC signing needs the key itself.
ALTER TABLE "shop_webhook_endpoints" ADD COLUMN "secret_enc" TEXT;

ALTER TABLE "shop_webhook_deliveries"
    ADD COLUMN "status"   TEXT        NOT NULL DEFAULT 'pending',
    ADD COLUMN "payload"  JSONB       NOT NULL DEFAULT '{}',
    ADD COLUMN "event_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "shop_webhook_deliveries"
    ADD CONSTRAINT "shop_webhook_deliveries_status_check"
    CHECK ("status" IN ('pending', 'delivered', 'retry', 'failed'));
CREATE UNIQUE INDEX "shop_webhook_deliveries_attempt_key"
    ON "shop_webhook_deliveries" ("endpoint_id", "outbox_id", "attempt") WHERE "outbox_id" IS NOT NULL;
DROP INDEX "shop_webhook_deliveries_next_attempt_idx";
CREATE INDEX "shop_webhook_deliveries_due_idx" ON "shop_webhook_deliveries" ("next_attempt_at")
    WHERE "status" = 'pending';
