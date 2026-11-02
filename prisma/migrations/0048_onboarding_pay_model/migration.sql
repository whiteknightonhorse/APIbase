-- T-0654: how the provider wants to be paid (api_key | x402_upstream). Additive and nullable; rows before this migration stay NULL.
ALTER TABLE "onboarding_submissions" ADD COLUMN IF NOT EXISTS "pay_model" TEXT;
