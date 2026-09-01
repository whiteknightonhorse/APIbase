-- F2/C-3 (2026-09-01): MODERATION stage settle-on-block + appeal tracking.
-- Additive, nullable columns -- NULL means "this row was never moderation-blocked",
-- never a stand-in for "not yet migrated" (unlike upstream_cost_usd's NULL convention).
ALTER TABLE "execution_ledger" ADD COLUMN IF NOT EXISTS "moderation_rule_id" TEXT;
ALTER TABLE "execution_ledger" ADD COLUMN IF NOT EXISTS "moderation_category" TEXT;
ALTER TABLE "execution_ledger" ADD COLUMN IF NOT EXISTS "moderation_appeal_id" UUID;

CREATE TABLE IF NOT EXISTS "moderation_appeals" (
    "appeal_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "execution_id" UUID,
    "agent_id" UUID,
    "tool_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "contact_email" TEXT,
    "message" TEXT,
    "resolution_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "response_due_at" TIMESTAMPTZ NOT NULL,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "moderation_appeals_pkey" PRIMARY KEY ("appeal_id")
);

CREATE INDEX IF NOT EXISTS "moderation_appeals_status_response_due_at_idx"
    ON "moderation_appeals" ("status", "response_due_at");
