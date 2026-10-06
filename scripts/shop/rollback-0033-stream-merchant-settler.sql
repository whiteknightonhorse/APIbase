-- T-INT-46: manual rollback of migration 0033_stream_merchant_settler (Prisma has no down migrations).
BEGIN;
UPDATE "shop_stream_sessions" SET "status" = 'open' WHERE "status" = 'close_pending';
ALTER TABLE "shop_stream_sessions" DROP COLUMN "settle_due_at";
ALTER TABLE "shop_stream_sessions" DROP CONSTRAINT "shop_stream_sessions_status_check";
ALTER TABLE "shop_stream_sessions" ADD CONSTRAINT "shop_stream_sessions_status_check"
    CHECK ("status" IN ('open', 'closed'));
COMMIT;
