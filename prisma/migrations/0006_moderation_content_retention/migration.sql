-- ШАГ 2 (2026-09-02): moderation_appeals gains the matched-content fields
-- and a content_expires_at column so retention is enforced by data, not
-- discipline. Table was empty in production at migration time (checked:
-- SELECT COUNT(*) FROM moderation_appeals = 0), so the NOT NULL column and
-- its default are both safe to add directly -- no backfill needed.
ALTER TABLE "moderation_appeals" ADD COLUMN IF NOT EXISTS "matched_field" TEXT;
ALTER TABLE "moderation_appeals" ADD COLUMN IF NOT EXISTS "matched_content" TEXT;
ALTER TABLE "moderation_appeals" ADD COLUMN IF NOT EXISTS "content_truncated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "moderation_appeals" ADD COLUMN IF NOT EXISTS "match_start" INTEGER;
ALTER TABLE "moderation_appeals" ADD COLUMN IF NOT EXISTS "match_end" INTEGER;
ALTER TABLE "moderation_appeals" ADD COLUMN IF NOT EXISTS "content_expires_at" TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days');

CREATE INDEX IF NOT EXISTS "moderation_appeals_content_expires_at_idx"
    ON "moderation_appeals" ("content_expires_at");
