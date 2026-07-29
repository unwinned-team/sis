-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "sizeLabel" TEXT,
ADD COLUMN     "tasteLabel" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "bonusApplied" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "recipientName" TEXT;
