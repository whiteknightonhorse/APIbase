-- T-0747 (SOUKBASE-A2B-1109 ruling-1): partner-mode grants. The registry chooses per partner whether a
-- grant mints a per-store key (mode key, T-0740) or none (mode partner: the partner pushes the catalog
-- with its own partner key; APIbase creates one grant-owned webhook endpoint at the partner's
-- registered delivery URL and parks that endpoint's secret on the handoff for one read).
ALTER TABLE shop_partner_grants
    ADD COLUMN mode text NOT NULL DEFAULT 'key' CHECK (mode IN ('key', 'partner'));
ALTER TABLE shop_partner_grants ALTER COLUMN key_hash DROP NOT NULL;
ALTER TABLE shop_partner_grants
    ADD CONSTRAINT shop_partner_grants_mode_key_check CHECK ((mode = 'key') = (key_hash IS NOT NULL));

ALTER TABLE shop_partner_handoffs ADD COLUMN grant_webhook_secret_enc text NULL;
