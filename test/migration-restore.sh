#!/usr/bin/env bash
set -euo pipefail
# Disposable local databases only; production is never accepted.
node -e 'const u=new URL(process.env.DATABASE_URL);if(!["127.0.0.1","localhost"].includes(u.hostname)||u.pathname!=="/motif_test")process.exit(1)'
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=motif_test PGPASSWORD=local_test_only
export PGDATABASE=motif_migration_test
createdb "$PGDATABASE"
psql -v ON_ERROR_STOP=1 < prisma/migrations/20261106000000_baseline/migration.sql
export DATABASE_URL=postgresql://motif_test:local_test_only@127.0.0.1:5432/motif_migration_test
npx prisma migrate resolve --applied 20261106000000_baseline
psql -v ON_ERROR_STOP=1 < prisma/migrations/20261106000100_product_structure/migration.sql
npx prisma migrate resolve --applied 20261106000100_product_structure
psql -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "Product" ("id","title","productCode","basePrice","images","qualityGrade","updatedAt") VALUES
('one','Existing jacket','MOTIF-001',2350000,ARRAY['https://images.example/one.webp'],'B',now()),
('two','Existing pants',NULL,3850000,ARRAY['https://images.example/two.webp'],'A_PLUS',now());
INSERT INTO "Variant" ("id","productId","size","color","sku","stock","priceDelta","chestWidthCm","lengthCm","waistCm","itemGrade","itemImages") VALUES
('v-one','one','L','black','one',1,0,59,69,NULL,'B',ARRAY['https://images.example/item.webp']),
('v-two','two','M','blue','two',1,500,57,67,84,'N',ARRAY[]::TEXT[]);
UPDATE "Product" SET "productType"='کاپشن', "mainFabric"='دورس',
  "complementaryFabrics"=ARRAY['دورس','کتان','شمعی'] WHERE "id"='one';
SQL
query='SELECT json_build_object('\''products'\'',(SELECT json_agg(t ORDER BY "id") FROM (SELECT "id","title","productCode","basePrice","images","qualityGrade","updatedAt","productType","mainFabric","complementaryFabrics" FROM "Product") t),'\''variants'\'',(SELECT json_agg(t ORDER BY "id") FROM (SELECT "id","productId","sku","stock","priceDelta","chestWidthCm","lengthCm","waistCm","itemGrade","itemImages" FROM "Variant") t))'
before=$(psql -Atc "$query")
archive=$(mktemp)
trap 'rm -f "$archive"; dropdb --if-exists motif_migration_test; dropdb --if-exists motif_restore_test' EXIT
pg_dump -Fc -f "$archive"
npx prisma migrate deploy
after=$(psql -Atc "$query")
[ "$before" = "$after" ]
psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM "Product" WHERE "id"='one'
    AND "fabrics"=ARRAY['دورس','کتان','شمعی'] AND "fabricBasis"='UNKNOWN'
    AND "mainCategories"=ARRAY['کاپشن']) OR NOT EXISTS (
      SELECT FROM "Product" WHERE "id"='two' AND "mainCategories"=ARRAY[]::TEXT[]
    ) THEN RAISE EXCEPTION 'Legacy attributes did not migrate as expected'; END IF;
  BEGIN
    UPDATE "Product" SET "mainCategories"=ARRAY['بادگیر'] WHERE "id"='one';
    RAISE EXCEPTION 'Invalid priority was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SQL
createdb motif_restore_test
PGDATABASE=motif_restore_test pg_restore --exit-on-error --no-owner -d motif_restore_test "$archive"
restored=$(PGDATABASE=motif_restore_test psql -Atc "$query")
[ "$before" = "$restored" ]
echo 'PASS: verified dump restores; migration preserves products, variants, fabrics and categories; priority constraint enforced.'
