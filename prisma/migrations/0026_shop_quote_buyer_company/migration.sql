-- T-INT-08: shop.order.pay stores the buyer company next to waive_withdrawal.
ALTER TABLE "shop_quotes" ADD COLUMN "buyer_company" TEXT;
