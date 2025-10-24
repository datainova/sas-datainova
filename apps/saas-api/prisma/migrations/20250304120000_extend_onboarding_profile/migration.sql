-- Create enum for organization size bands
CREATE TYPE "organization_size" AS ENUM (
  'SIZE_1_10',
  'SIZE_11_50',
  'SIZE_51_200',
  'SIZE_201_1000',
  'SIZE_1001_PLUS'
);

-- Extend organization with onboarding profile fields
ALTER TABLE "organization"
  ADD COLUMN "country_code" TEXT,
  ADD COLUMN "country_name" TEXT,
  ADD COLUMN "segment_key" TEXT,
  ADD COLUMN "segment_label" TEXT,
  ADD COLUMN "size" "organization_size",
  ADD COLUMN "size_label" TEXT,
  ADD COLUMN "mission" TEXT,
  ADD COLUMN "vision" TEXT,
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "onboarding_completed_at" TIMESTAMPTZ;

-- Track session completion timestamp
ALTER TABLE "onboarding_session"
  ADD COLUMN "completed_at" TIMESTAMPTZ;
