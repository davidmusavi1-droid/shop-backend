-- Additive only. Review/backup/approval required before production execution.
BEGIN;
CREATE TABLE IF NOT EXISTS "ShippingTariff" (
  "id" TEXT PRIMARY KEY, "source" TEXT NOT NULL, "carrier" TEXT NOT NULL,
  "originProvince" TEXT NOT NULL, "originCity" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL, "validUntil" TIMESTAMP(3) NOT NULL,
  "rules" JSONB NOT NULL CHECK (jsonb_typeof("rules")='array'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("validUntil" > "validFrom")
);
CREATE TABLE IF NOT EXISTS "ShippingTariffState" (
  "id" TEXT PRIMARY KEY, "activeTariffId" TEXT REFERENCES "ShippingTariff"("id") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "OrderShippingSnapshot" (
  "orderId" TEXT PRIMARY KEY REFERENCES "Order"("id") ON DELETE RESTRICT,
  "tariffId" TEXT NOT NULL REFERENCES "ShippingTariff"("id") ON DELETE RESTRICT,
  "fee" INTEGER NOT NULL CHECK ("fee">0), "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE FUNCTION motif_shipping_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Shipping tariff and order quote history is immutable'; END;
$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='motif_shipping_tariff_immutable' AND tgrelid='"ShippingTariff"'::regclass) THEN
    CREATE TRIGGER motif_shipping_tariff_immutable BEFORE UPDATE OR DELETE ON "ShippingTariff" FOR EACH ROW EXECUTE FUNCTION motif_shipping_immutable();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='motif_shipping_order_immutable' AND tgrelid='"OrderShippingSnapshot"'::regclass) THEN
    CREATE TRIGGER motif_shipping_order_immutable BEFORE UPDATE OR DELETE ON "OrderShippingSnapshot" FOR EACH ROW EXECUTE FUNCTION motif_shipping_immutable();
  END IF;
END $$;
COMMIT;
