-- T-INT-13 (spec 12.2): the incident engine queues merchant mail as
-- email_events(direction='out', status='queued', kind, merchant_id, template); the sender is
-- INT-18. email_events was inbound-only (0009/0022), so the outbound shape is added here,
-- additively: every existing row is an inbound mail and backfills direction='in'.
-- class stays NOT NULL and inside email_events_class_check, so outbound rows carry
-- class='UNMATCHED' (the enum is cross-checked by tests/unit/autopilot-schema-0009.test.ts
-- and is deliberately not widened); direction is the discriminator.
ALTER TABLE "email_events" ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'in';
ALTER TABLE "email_events" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "email_events" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "email_events" ADD COLUMN IF NOT EXISTS "merchant_id" UUID;
ALTER TABLE "email_events" ADD COLUMN IF NOT EXISTS "template" TEXT;
ALTER TABLE "email_events" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "email_events" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "email_events" ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMPTZ;
ALTER TABLE "email_events" ADD COLUMN IF NOT EXISTS "provider_message_id" TEXT;

ALTER TABLE "email_events" DROP CONSTRAINT IF EXISTS "email_events_direction_check";
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_direction_check" CHECK ("direction" IN ('in', 'out'));
ALTER TABLE "email_events" DROP CONSTRAINT IF EXISTS "email_events_out_status_check";
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_out_status_check" CHECK (
    ("direction" = 'in' AND "status" IS NULL)
    OR ("direction" = 'out' AND "status" IN ('queued', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS "email_events_out_queue_idx" ON "email_events" ("direction", "status", "merchant_id");
