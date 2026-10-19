-- T-0431: Integrator subscriptions on the MPP `subscription` intent (Tempo, day/week plans).
-- Third pull mode `mpp_subscription`: the payer authorizes a periodic key whose address belongs to
-- APIbase; the platform renews each period with that key and pays the gas. Nothing changes for
-- existing subscriptions (their pull_mode stays none / base_preauth / tempo_keychain).
ALTER TABLE "shop_subscriptions" DROP CONSTRAINT IF EXISTS "shop_subscriptions_pull_mode_check";
ALTER TABLE "shop_subscriptions" ADD CONSTRAINT "shop_subscriptions_pull_mode_check"
    CHECK ("pull_mode" IN ('none', 'base_preauth', 'tempo_keychain', 'mpp_subscription'));

-- One row per activated mppx subscription, written when the activation credential is verified
-- (before the period-1 order exists), linked to the shop subscription when period 1 is PAID.
-- `access_key` is the ADDRESS of APIbase's own key; no payer key or secret is stored here.
CREATE TABLE "shop_subscription_mpp" (
    "quote_id"             UUID         NOT NULL,
    "mppx_subscription_id" TEXT         NOT NULL,
    "subscription_id"      UUID,
    "payer"                TEXT         NOT NULL,
    "recipient"            TEXT         NOT NULL,
    "access_key"           TEXT         NOT NULL,
    "activation_tx"        TEXT         NOT NULL,
    "key_expires_at"       TIMESTAMPTZ  NOT NULL,
    "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shop_subscription_mpp_pkey" PRIMARY KEY ("quote_id"),
    CONSTRAINT "shop_subscription_mpp_subscription_fkey" FOREIGN KEY ("subscription_id")
        REFERENCES "shop_subscriptions" ("subscription_id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "shop_subscription_mpp_subscription_key"
    ON "shop_subscription_mpp" ("subscription_id") WHERE "subscription_id" IS NOT NULL;

-- A renewal attempt per (subscription, period): the primary key is the idempotency guard, so a
-- period is renewed at most once. `unknown` = the transaction may have been mined; it is resolved
-- against the chain and never submitted a second time.
CREATE TABLE "shop_subscription_mpp_renewals" (
    "subscription_id" UUID         NOT NULL,
    "period_no"       INTEGER      NOT NULL,
    "status"          TEXT         NOT NULL DEFAULT 'submitted',
    "tx_hash"         TEXT,
    "reason"          TEXT,
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shop_subscription_mpp_renewals_pkey" PRIMARY KEY ("subscription_id", "period_no"),
    CONSTRAINT "shop_subscription_mpp_renewals_subscription_fkey" FOREIGN KEY ("subscription_id")
        REFERENCES "shop_subscriptions" ("subscription_id") ON DELETE CASCADE,
    CONSTRAINT "shop_subscription_mpp_renewals_status_check"
        CHECK ("status" IN ('submitted', 'unknown', 'confirmed', 'failed'))
);
