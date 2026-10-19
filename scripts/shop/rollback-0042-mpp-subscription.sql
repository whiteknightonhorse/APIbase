-- T-0431: manual rollback of migration 0042_mpp_subscription (Prisma has no down migrations).
-- Subscriptions that already use pull_mode mpp_subscription go back to `none`: they are renewed by
-- the buyer's agent again. The mppx store (Redis) keeps its own records; they are inert without the table.
BEGIN;
UPDATE "shop_subscriptions" SET "pull_mode" = 'none' WHERE "pull_mode" = 'mpp_subscription';
DROP TABLE "shop_subscription_mpp_renewals";
DROP TABLE "shop_subscription_mpp";
ALTER TABLE "shop_subscriptions" DROP CONSTRAINT "shop_subscriptions_pull_mode_check";
ALTER TABLE "shop_subscriptions" ADD CONSTRAINT "shop_subscriptions_pull_mode_check"
    CHECK ("pull_mode" IN ('none', 'base_preauth', 'tempo_keychain'));
COMMIT;
