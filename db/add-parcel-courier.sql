-- ADDITIVE; never run by production startup. Requires separate production approval.
BEGIN;
CREATE TABLE IF NOT EXISTS "ShippingOperations" (
 "id" TEXT PRIMARY KEY, "settings" JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS "ShippingMeasurement" (
 "variantId" TEXT PRIMARY KEY REFERENCES "Variant"("id") ON DELETE RESTRICT,
 "grams" INTEGER NOT NULL CHECK ("grams">0 AND "grams"<=100000), "approvedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "ShippingPackingPlan" (
 "id" TEXT PRIMARY KEY, "items" JSONB NOT NULL,
 "tareGrams" INTEGER NOT NULL CHECK ("tareGrams">0),
 "lengthMm" INTEGER NOT NULL CHECK ("lengthMm">0),
 "widthMm" INTEGER NOT NULL CHECK ("widthMm">0),
 "heightMm" INTEGER NOT NULL CHECK ("heightMm">0),
 "approvedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "CourierRequest" (
 "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL,
 "tokenHash" TEXT NOT NULL, "clientHash" TEXT NOT NULL, "phoneHash" TEXT NOT NULL, "payload" JSONB NOT NULL,
 "state" TEXT NOT NULL CHECK ("state" IN ('AWAITING_COORDINATION','OFFERED','ACCEPTED')),
 "revision" INTEGER NOT NULL DEFAULT 0, "offer" JSONB,
 "orderId" TEXT UNIQUE REFERENCES "Order"("id") ON DELETE RESTRICT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "CourierRequest_phoneHash_createdAt_idx" ON "CourierRequest"("phoneHash","createdAt");
CREATE TABLE IF NOT EXISTS "CourierOffer" (
 "requestId" TEXT NOT NULL REFERENCES "CourierRequest"("id") ON DELETE RESTRICT,
 "revision" INTEGER NOT NULL, "details" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("requestId","revision")
);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='motif_courier_offer_immutable' AND tgrelid='"CourierOffer"'::regclass) THEN
  CREATE TRIGGER motif_courier_offer_immutable BEFORE UPDATE OR DELETE ON "CourierOffer" FOR EACH ROW EXECUTE FUNCTION motif_shipping_immutable();
 END IF;
END $$;
COMMIT;
