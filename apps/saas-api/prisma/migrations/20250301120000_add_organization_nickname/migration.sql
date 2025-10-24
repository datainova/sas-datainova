-- Add optional nickname for organizations and enforce uniqueness
ALTER TABLE "organization"
  ADD COLUMN "nickname" CITEXT;

CREATE UNIQUE INDEX "uq_organization_nickname"
  ON "organization" ("nickname");
