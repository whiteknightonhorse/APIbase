-- T-0873 (REQUEST-SOUKBASE-R5-4-1116 ruling-1): a grant handoff may name the scopes it adds to a live
-- grant (today only quotes:read). NULL = none: the handoff asks for the whole grant, as before.
ALTER TABLE shop_partner_handoffs ADD COLUMN requested_scopes text[] NULL;
