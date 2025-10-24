-- CreateEnum
CREATE TYPE "billing_plan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- AlterTable
ALTER TABLE "organization"
  ADD COLUMN "billing_plan" "billing_plan" NOT NULL DEFAULT 'PRO';
