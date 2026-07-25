/*
  Warnings:

  - You are about to drop the column `customerId` on the `AgeVerification` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "AgeVerification" DROP CONSTRAINT "AgeVerification_customerId_fkey";

-- DropIndex
DROP INDEX "AgeVerification_customerId_idx";

-- AlterTable
ALTER TABLE "AgeVerification" DROP COLUMN "customerId";
