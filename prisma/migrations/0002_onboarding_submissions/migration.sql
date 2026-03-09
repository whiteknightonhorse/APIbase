-- Step 39: Smart Onboarding Form (§6.12, §AP-10)
-- OnboardingSubmission table for provider onboarding requests.

CREATE TABLE "onboarding_submissions" (
    "submission_id"      TEXT         NOT NULL,
    "company_name"       TEXT         NOT NULL,
    "api_url"            TEXT         NOT NULL,
    "contact_email"      TEXT         NOT NULL,
    "category"           TEXT         NOT NULL,
    "description"        TEXT         NOT NULL,
    "affiliate_program"  TEXT,
    "monthly_volume"     TEXT,
    "ip_address"         TEXT         NOT NULL,
    "status"             TEXT         NOT NULL DEFAULT 'pending',
    "moderation_result"  JSONB,
    "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "onboarding_submissions_pkey" PRIMARY KEY ("submission_id"),
    CONSTRAINT "onboarding_submissions_category_check"
        CHECK ("category" IN ('travel', 'food', 'finance', 'e-commerce', 'other')),
    CONSTRAINT "onboarding_submissions_status_check"
        CHECK ("status" IN ('pending', 'accepted', 'rejected'))
);

CREATE INDEX "onboarding_submissions_status_idx" ON "onboarding_submissions" ("status");
CREATE INDEX "onboarding_submissions_created_at_idx" ON "onboarding_submissions" ("created_at");
