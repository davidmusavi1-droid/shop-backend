ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "productCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Product_productCode_key" ON "Product"("productCode");
