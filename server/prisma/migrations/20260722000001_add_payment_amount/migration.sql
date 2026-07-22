-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentAmount" DECIMAL(10,2),
ADD COLUMN     "paymentAmountKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_paymentAmountKey_key" ON "Order"("paymentAmountKey");
