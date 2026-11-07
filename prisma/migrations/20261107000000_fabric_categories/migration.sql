BEGIN;
CREATE TYPE "FabricBasis" AS ENUM ('SELLER', 'LABEL', 'UNKNOWN');

ALTER TABLE "Product"
  ADD COLUMN "fabrics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "fabricBasis" "FabricBasis" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "mainCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "FabricOption" (
  "key" TEXT PRIMARY KEY,
  "label" TEXT NOT NULL
);

UPDATE "Product"
SET "fabrics" = ARRAY(
  SELECT label FROM unnest(array_prepend("mainFabric", COALESCE("complementaryFabrics", ARRAY[]::TEXT[])))
    WITH ORDINALITY AS items(label, position)
  WHERE label IS NOT NULL AND btrim(label) <> ''
  GROUP BY label ORDER BY min(position)
),
"mainCategories" = CASE
  WHEN btrim("productType") <> '' THEN ARRAY["productType"]
  ELSE ARRAY[]::TEXT[]
END;

ALTER TABLE "Product" ADD CONSTRAINT "Product_priority_category_check" CHECK (
  (cardinality("mainCategories") = 0 AND NULLIF(btrim("productType"), '') IS NULL)
  OR ("productType" IS NOT NULL AND "productType" = ANY("mainCategories"))
);
COMMIT;
