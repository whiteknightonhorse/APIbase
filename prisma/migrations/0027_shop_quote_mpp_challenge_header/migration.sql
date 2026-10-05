-- T-INT-10: the one MPP challenge per quote is returned byte for byte until it expires.
ALTER TABLE "shop_quotes" ADD COLUMN "mpp_challenge_header" TEXT;
