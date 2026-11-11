-- T-0768: the optional buyer-facing support e-mail (shown on open orders). contact_email stays private.
-- No backfill: existing shops have none.
ALTER TABLE shop_merchants ADD COLUMN support_email text NULL;
