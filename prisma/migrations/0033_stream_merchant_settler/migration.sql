-- T-INT-46 (UC-7 variant b / F-9): the merchant settles its own channels with its own key.
-- A close of a `merchant`-settled channel is accepted by APIbase but executed by the merchant:
-- the session waits in `close_pending`. `settle_due_at` marks that the overdue notice was sent.
ALTER TABLE "shop_stream_sessions" DROP CONSTRAINT "shop_stream_sessions_status_check";
ALTER TABLE "shop_stream_sessions" ADD CONSTRAINT "shop_stream_sessions_status_check"
    CHECK ("status" IN ('open', 'close_pending', 'closed'));
ALTER TABLE "shop_stream_sessions" ADD COLUMN "settle_due_at" TIMESTAMPTZ;
