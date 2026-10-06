-- T-INT-40: manual rollback of migration 0027_wave3 (Prisma has no down migrations).
-- Run in a transaction against a DISPOSABLE or maintenance-window database; it drops wave-3 data.
BEGIN;
DELETE FROM "incidents" WHERE "kind" IN ('STREAM_SETTLE_OVERDUE', 'SUBSCRIPTION_PULL_FAILED');
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_kind_check";
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_kind_check" CHECK ("kind" IN (
    'AUTH_FAILED', 'CREDENTIAL_EXPIRED', 'PROVIDER_DOWN', 'DEGRADED_QUALITY',
    'RATE_LIMITED', 'QUOTA_LOW', 'QUOTA_EXHAUSTED', 'PAYMENT_REQUIRED',
    'API_CHANGED', 'ENDPOINT_CHANGED', 'EMAIL_NOTICE', 'UNKNOWN',
    'CONNECT_FAILED', 'WEBHOOK_FAILED', 'MERCHANT_UNRESPONSIVE', 'REFUND_OVERDUE',
    'DISPUTE_UNANSWERED', 'CATALOG_REJECTED', 'MODERATION_FLAG', 'PAYOUT_WALLET_SANCTIONED',
    'PAYER_SANCTIONED', 'PAYMENT_MISMATCH', 'FEE_INVOICE_OVERDUE', 'STOREFRONT_DOWN'
));
DROP TABLE "shop_payment_identifiers";
DROP TABLE "shop_subscription_authorizations";
DROP TABLE "shop_subscription_periods";
DROP TABLE "shop_subscriptions";
DROP TABLE "shop_stream_settlements";
DROP TABLE "shop_stream_sessions";
DELETE FROM "shop_fee_ledger" WHERE "source" <> 'order';
ALTER TABLE "shop_fee_ledger" DROP CONSTRAINT "shop_fee_ledger_order_source_check";
ALTER TABLE "shop_fee_ledger" DROP CONSTRAINT "shop_fee_ledger_source_check";
DROP INDEX "shop_fee_ledger_source_ref_idx";
ALTER TABLE "shop_fee_ledger" DROP COLUMN "source_ref";
ALTER TABLE "shop_fee_ledger" DROP COLUMN "source";
ALTER TABLE "shop_fee_ledger" ALTER COLUMN "order_id" SET NOT NULL;
DELETE FROM "shop_products" WHERE "fulfillment_mode" IN ('stream', 'subscription');
ALTER TABLE "shop_products" DROP CONSTRAINT "shop_products_fulfillment_mode_check";
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_fulfillment_mode_check"
    CHECK ("fulfillment_mode" IN ('instant', 'merchant', 'physical'));
ALTER TABLE "shop_products" DROP COLUMN "subscription";
ALTER TABLE "shop_products" DROP COLUMN "stream";
ALTER TABLE "shop_merchants" DROP CONSTRAINT "shop_merchants_stream_settler_check";
ALTER TABLE "shop_merchants" DROP COLUMN "stream_settler";
ALTER TABLE "shop_merchants" DROP COLUMN "provek";
-- shop_acceptances is append-only: this fails (by design) if a contract_wallet_signature row exists.
ALTER TABLE "shop_acceptances" DROP CONSTRAINT "shop_acceptances_method_check";
ALTER TABLE "shop_acceptances" ADD CONSTRAINT "shop_acceptances_method_check"
    CHECK ("method" IN ('wallet_signature', 'checkbox+wallet_signature'));
COMMIT;
