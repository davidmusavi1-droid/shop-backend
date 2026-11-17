BEGIN;
CREATE TABLE IF NOT EXISTS "ShippingSettings" (
  "id" TEXT PRIMARY KEY,
  "fee" INTEGER NOT NULL CHECK ("fee" >= 0)
);
CREATE TABLE IF NOT EXISTS "CheckoutReservation" (
  "orderId" TEXT PRIMARY KEY REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestKey" TEXT NOT NULL UNIQUE,
  "requestHash" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "province" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  "shippingFee" INTEGER NOT NULL CHECK ("shippingFee" >= 0),
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "CheckoutReservation_expiresAt_idx" ON "CheckoutReservation"("expiresAt");
COMMIT;
