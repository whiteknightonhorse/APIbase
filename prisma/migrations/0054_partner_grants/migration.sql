-- T-0740 (SOUKBASE-A16-1109 ruling-1 A-2): one wallet signature (purpose grant) gives a partner a
-- per-merchant key limited to catalog:write + webhooks:write. The key is a shop_merchant_keys row (its
-- sha256 only); the plaintext is held encrypted on the handoff until the partner reads it once.
CREATE TABLE shop_partner_grants (
    grant_id    uuid        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id uuid        NOT NULL REFERENCES shop_merchants (merchant_id),
    partner_id  text        NOT NULL,
    key_hash    CHAR(64)    NOT NULL REFERENCES shop_merchant_keys (key_hash),
    scopes      text[]      NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    revoked_at  timestamptz NULL,
    CONSTRAINT shop_partner_grants_pkey PRIMARY KEY (grant_id),
    CONSTRAINT shop_partner_grants_key_hash_key UNIQUE (key_hash)
);
CREATE UNIQUE INDEX shop_partner_grants_active_uq
    ON shop_partner_grants (merchant_id, partner_id) WHERE revoked_at IS NULL;

-- An endpoint created under a grant key belongs to that grant (grant-scoped list/update/delete).
ALTER TABLE shop_webhook_endpoints ADD COLUMN grant_id uuid NULL REFERENCES shop_partner_grants (grant_id);
CREATE INDEX shop_webhook_endpoints_grant_idx ON shop_webhook_endpoints (grant_id) WHERE grant_id IS NOT NULL;

ALTER TABLE shop_partner_handoffs
    ADD COLUMN mode text NOT NULL DEFAULT 'register' CHECK (mode IN ('register', 'grant')),
    ADD COLUMN grant_requested boolean NOT NULL DEFAULT false,
    ADD COLUMN grant_id uuid NULL REFERENCES shop_partner_grants (grant_id),
    ADD COLUMN grant_key_enc text NULL,
    ADD COLUMN grant_delivered_at timestamptz NULL;
ALTER TABLE shop_partner_handoffs DROP CONSTRAINT shop_partner_handoffs_state_check;
ALTER TABLE shop_partner_handoffs
    ADD CONSTRAINT shop_partner_handoffs_state_check CHECK (state IN ('created', 'opened', 'registered', 'granted'));
