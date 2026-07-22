-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CLAIMED', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "nextCheckAt" TIMESTAMP(3),
ADD COLUMN     "paymentRef" TEXT,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verifyAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Order_paymentRef_key" ON "Order"("paymentRef");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_nextCheckAt_idx" ON "Order"("paymentStatus", "nextCheckAt");

