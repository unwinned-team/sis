-- CreateTable
CREATE TABLE "AgeVerification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,

    CONSTRAINT "AgeVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgeVerification_orderId_key" ON "AgeVerification"("orderId");

-- CreateIndex
CREATE INDEX "AgeVerification_customerId_idx" ON "AgeVerification"("customerId");

-- AddForeignKey
ALTER TABLE "AgeVerification" ADD CONSTRAINT "AgeVerification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgeVerification" ADD CONSTRAINT "AgeVerification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
