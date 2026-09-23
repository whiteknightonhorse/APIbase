-- T-0168 (FT-10 of T-0155 "Список задач для Fleet" п.14 + operator addition
-- 2026-09-23): spam-folder support and two new email_events classes.
--
-- source_folder distinguishes which IMAP folder a row came from (FT-10's own
-- acceptance text: "новые строки email_events помечены source_folder='spam'").
-- Existing rows backfill 'inbox' -- the only folder email-intake.py read
-- before this migration, so this is a true statement about their history,
-- not a guess.
ALTER TABLE "email_events" ADD COLUMN IF NOT EXISTS "source_folder" TEXT NOT NULL DEFAULT 'inbox';

-- LIMIT_CHANGE ("a provider changed our limit to a new number") and
-- PARTNER_REPLY ("a reply to our own partner-program/legal-clarification
-- outreach") are added to the enum. LIMIT_CHANGE's CLASS_TO_KIND mapping
-- (-> EMAIL_NOTICE, decided by Fable's own FT-10 design text, not guessed) is
-- wired up in email-intake.py. PARTNER_REPLY's mapping is deliberately NOT
-- wired up yet -- see email-intake.py's own CLASS_TO_KIND comment and
-- disputes/0168-ft10-spam-folder-limit-change-and-partner-reply-class.q-1.md
-- for the open question. Safe to re-apply (DROP IF EXISTS then ADD, same
-- convention already used for CHECK constraints elsewhere in this schema).
ALTER TABLE "email_events" DROP CONSTRAINT IF EXISTS "email_events_class_check";
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_class_check" CHECK ("class" IN (
    'KEY_EXPIRES', 'KEY_REVOKED', 'DEPRECATION', 'SUNSET', 'ENDPOINT_CHANGE',
    'PRICING_CHANGE', 'PAYMENT_FAILED', 'QUOTA', 'MAINTENANCE', 'SECURITY_CHANGE',
    'ACCOUNT_ACTION', 'MARKETING', 'UNMATCHED', 'DEFERRED_BUDGET',
    'LIMIT_CHANGE', 'PARTNER_REPLY'
));
