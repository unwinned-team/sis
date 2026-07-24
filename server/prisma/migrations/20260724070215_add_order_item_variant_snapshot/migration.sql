-- DropIndex
DROP INDEX "OrderItem_orderId_productId_key";

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "size" TEXT,
ADD COLUMN     "taste" TEXT,
ADD COLUMN     "variantId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_productId_variantId_key" ON "OrderItem"("orderId", "productId", "variantId");

