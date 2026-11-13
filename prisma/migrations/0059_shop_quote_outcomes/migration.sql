-- T-0826 (SOUKBASE-QUOTES-1113 ruling-1): what happened to a quote, for a partner whose grant has
-- quotes:read. Two small tables, best-effort writes; nothing else is stored (no IP, user-agent beyond a
-- product token, e-mail, buyer token or identity, payer, payment header, signature or transaction hash,
-- item title or fee). No column is added to shop_quotes or shop_orders.
CREATE TABLE shop_quote_outcomes (
    quote_id        uuid PRIMARY KEY,
    merchant_id     uuid NOT NULL,
    challenges      int NOT NULL DEFAULT 0,
    pay_attempts    int NOT NULL DEFAULT 0,
    last_error_code text NULL,
    last_error_at   timestamptz NULL,
    client          text NULL,
    read_at         timestamptz NULL,
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shop_quote_outcomes_merchant_updated_idx
    ON shop_quote_outcomes (merchant_id, updated_at, quote_id);

CREATE TABLE shop_quote_refusals (
    id          bigserial PRIMARY KEY,
    at          timestamptz NOT NULL DEFAULT now(),
    merchant_id uuid NOT NULL,
    error_code  text NOT NULL,
    skus        text[] NOT NULL
);
CREATE INDEX shop_quote_refusals_merchant_at_idx
    ON shop_quote_refusals (merchant_id, at, id);
