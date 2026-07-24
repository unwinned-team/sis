-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "telegram" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "telegramUsername" TEXT;
