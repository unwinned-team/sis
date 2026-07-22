-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CLAIMED', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "nextCheckAt" TIMESTAMP(3),
ADD COLUMN     "paymentRef" TEXT,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verifyAttempts" INTEGER NOT NULL DEFAULT 0;

-- Existing BONUS orders were already debited; completed CARD/CASH orders were
-- paid outside this verification flow. Cancelled orders are terminal/unpaid.
UPDATE "Order"
SET "paymentStatus" = 'PAID'
WHERE "paymentMethod" = 'BONUS' OR "status" = 'COMPLETED';

UPDATE "Order"
SET "paymentStatus" = 'FAILED'
WHERE "status" = 'CANCELLED';

-- CreateIndex
CREATE UNIQUE INDEX "Order_paymentRef_key" ON "Order"("paymentRef");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_nextCheckAt_idx" ON "Order"("paymentStatus", "nextCheckAt");
