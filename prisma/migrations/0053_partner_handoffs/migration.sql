-- T-0739 (SOUKBASE-A16-1109 ruling-1 A-1): a registered partner creates a handoff with its key; the
-- connect page is prefilled from it and registration binds it. `expired` is computed from expires_at,
-- never stored. The prefill (may hold an e-mail) is nulled on registration and by the sweeper after expiry.
CREATE TABLE shop_partner_handoffs (
    handoff_id      uuid        NOT NULL DEFAULT gen_random_uuid(),
    partner_id      text        NOT NULL,
    seller_ref      text        NULL CHECK (seller_ref IS NULL OR char_length(seller_ref) <= 128),
    prefill         jsonb       NULL,
    expected_wallet text        NULL CHECK (expected_wallet IS NULL OR expected_wallet = lower(expected_wallet)),
    state           text        NOT NULL DEFAULT 'created' CHECK (state IN ('created', 'opened', 'registered')),
    merchant_id     uuid        NULL,
    slug            text        NULL,
    wallet_match    boolean     NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    opened_at       timestamptz NULL,
    registered_at   timestamptz NULL,
    CONSTRAINT shop_partner_handoffs_pkey PRIMARY KEY (handoff_id)
);
CREATE INDEX shop_partner_handoffs_partner_created_idx ON shop_partner_handoffs (partner_id, created_at);
