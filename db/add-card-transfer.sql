BEGIN;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shipmentTrackingCode" TEXT;
CREATE TABLE IF NOT EXISTS "CardTransferSettings" (
  "id" TEXT PRIMARY KEY,
  "cardNumber" TEXT NOT NULL,
  "accountHolder" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS "CardTransfer" (
  "paymentId" TEXT PRIMARY KEY REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "receipt" BYTEA NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  "rejected" BOOLEAN NOT NULL DEFAULT false
);
COMMIT;
