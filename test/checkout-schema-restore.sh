#!/usr/bin/env bash
set -euo pipefail
# CI fixture only. Never accept a production connection or an inherited URL.
[[ "${PGHOST:-}" = "127.0.0.1" && "${PGUSER:-}" = "motif_schema_test" && "${PGDATABASE:-}" = "motif_schema_test" ]]
[[ -z "${DATABASE_URL:-}" ]]
[[ "$(psql -XAtc 'SHOW server_version_num')" = "180004" ]]
root=/tmp/motif-schema-source
for file in "$root"/prisma/migrations/*/migration.sql; do
  psql -X -v ON_ERROR_STOP=1 -f "$file"
done
for file in add-product-code add-site-content add-waist-width; do
  psql -X -v ON_ERROR_STOP=1 -f "$root/db/$file.sql"
done
psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "Product" ("id","title","basePrice","images","customerNeeds","styles","updatedAt")
VALUES ('schema-product','Synthetic legacy product',100000,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],now());
INSERT INTO "Variant" ("id","productId","size","color","sku","stock","itemImages")
VALUES ('schema-variant','schema-product','L','blue','SCHEMA-ONLY',1,ARRAY[]::text[]);
INSERT INTO "Customer" ("id","fullName","phone") VALUES ('schema-customer','Synthetic customer','09000000001');
INSERT INTO "Order" ("id","customerId","totalPrice","updatedAt") VALUES ('schema-order','schema-customer',150000,now());
INSERT INTO "OrderItem" ("id","orderId","productId","variantId","quantity","unitPrice")
VALUES ('schema-item','schema-order','schema-product','schema-variant',1,100000);
INSERT INTO "Payment" ("id","orderId","amount") VALUES ('schema-payment','schema-order',150000);
SQL
query=$(cat <<'SQL'
SELECT jsonb_build_object(
 'products',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "Product" t),
 'variants',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "Variant" t),
 'customers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "Customer" t),
 'orders',(SELECT jsonb_agg(to_jsonb(t)-'shipmentTrackingCode' ORDER BY id) FROM "Order" t),
 'items',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "OrderItem" t),
 'payments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "Payment" t));
SQL
)
before=$(psql -XAtc "$query")
apply_checkout() {
  for file in add-guest-checkout add-card-transfer add-order-tracking add-zibal-attempt; do
    psql -X -v ON_ERROR_STOP=1 -f "$root/db/$file.sql"
  done
}
apply_checkout
[[ "$before" = "$(psql -XAtc "$query")" ]]
echo 'PASS PostgreSQL 18.4: four checkout scripts preserve existing products, stock, orders and payments'
psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "ShippingSettings" VALUES ('default',50000);
INSERT INTO "CheckoutReservation"
("orderId","requestKey","requestHash","fullName","phone","address","province","city","postalCode","shippingFee","expiresAt")
VALUES ('schema-order','schema-key','fixture','Synthetic','09000000001','Fixture','Fixture','Fixture','1111111111',50000,now()+interval '30 minutes');
INSERT INTO "CardTransferSettings" VALUES ('default','0000000000000000','Synthetic',false);
INSERT INTO "CardTransfer" ("paymentId","receipt") VALUES ('schema-payment',decode('ffd8ff','hex'));
INSERT INTO "OrderTrackingChallenge" ("id","orderId","phone","tokenHash","expiresAt")
VALUES ('schema-challenge','schema-order','09000000001',repeat('a',64),now()+interval '5 minutes');
INSERT INTO "ZibalAttempt" ("paymentId","trackId","state","trackIssuedAt")
VALUES ('schema-payment','123456789','OPEN',now());
SQL
full_query=$(cat <<'SQL'
SELECT jsonb_build_object(
 'shipping',(SELECT jsonb_agg(to_jsonb(t)) FROM "ShippingSettings" t),
 'reservation',(SELECT jsonb_agg(to_jsonb(t)) FROM "CheckoutReservation" t),
 'cardSettings',(SELECT jsonb_agg(to_jsonb(t)) FROM "CardTransferSettings" t),
 'receipt',(SELECT jsonb_agg(to_jsonb(t)) FROM "CardTransfer" t),
 'challenge',(SELECT jsonb_agg(to_jsonb(t)) FROM "OrderTrackingChallenge" t),
 'attempt',(SELECT jsonb_agg(to_jsonb(t)) FROM "ZibalAttempt" t));
SQL
)
checkout_before=$(psql -XAtc "$full_query")
apply_checkout
[[ "$before" = "$(psql -XAtc "$query")" ]]
[[ "$checkout_before" = "$(psql -XAtc "$full_query")" ]]
echo 'PASS PostgreSQL 18.4: reapplying all four scripts preserves existing checkout records'

# PR35 compatibility upgrades: preserve private legacy receipt bytes and retired
# shipping history while enforcing the current policy on every new insert.
for file in add-zibal-retries add-destination-shipping add-parcel-courier add-postpaid-shipping; do
  psql -X -v ON_ERROR_STOP=1 -f "$root/db/$file.sql"
done
psql -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "ShippingTariff" ("id","source","carrier","originProvince","originCity","validFrom","validUntil","rules")
VALUES ('schema-tariff','Synthetic fixture only','POST_PISHTAZ_POSTPAID','Alborz','Karaj',now(),now()+interval '1 day','[]'::jsonb);
INSERT INTO "OrderShippingSnapshot" ("orderId","tariffId","fee","details")
VALUES ('schema-order','schema-tariff',50000,'{"method":"POST_PISHTAZ","legacy":true}'::jsonb);
-- Simulate a snapshot already committed by the retired proposal, not new policy.
ALTER TABLE "OrderShippingSnapshot" DROP CONSTRAINT "OrderShippingSnapshot_fee_check";
ALTER TABLE "OrderShippingSnapshot" ADD CONSTRAINT "OrderShippingSnapshot_fee_check" CHECK ("fee">=0);
INSERT INTO "Order" ("id","customerId","totalPrice","updatedAt") VALUES ('schema-retired-order','schema-customer',9000000,now());
INSERT INTO "Payment" ("id","orderId","amount","isSuccessful") VALUES ('schema-retired-payment','schema-retired-order',9000000,true);
INSERT INTO "OrderShippingSnapshot" ("orderId","tariffId","fee","details")
VALUES ('schema-retired-order','schema-tariff',0,'{"method":"POST_PISHTAZ_POSTPAID","shippingChargeMode":"MERCHANT_PAYS","shippingFee":0,"customerAccepted":true,"freeShipping":true,"policyRevision":"retired"}'::jsonb);
SQL
for _ in 1 2; do
  for file in add-payment-evidence add-shipping-policy; do
    psql -X -v ON_ERROR_STOP=1 -f "$root/db/$file.sql"
  done
done
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "CardTransfer" WHERE "paymentId"='schema-payment' AND "receipt"=decode('ffd8ff','hex') AND "receiptDigest"=encode(sha256(decode('ffd8ff','hex')),'hex')) THEN RAISE EXCEPTION 'Legacy receipt was changed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "OrderShippingSnapshot" WHERE "orderId"='schema-retired-order' AND "details"->>'shippingChargeMode'='MERCHANT_PAYS') THEN RAISE EXCEPTION 'Retired history was lost'; END IF;
END $$;
INSERT INTO "Order" ("id","customerId","totalPrice","updatedAt") VALUES ('schema-code-order','schema-customer',25000,now());
INSERT INTO "Payment" ("id","orderId","amount") VALUES ('schema-code-payment','schema-code-order',25000);
INSERT INTO "CardTransfer" ("paymentId","bankTrackingCode") VALUES ('schema-code-payment','1234567890');
DO $$
BEGIN
 BEGIN
  INSERT INTO "OrderShippingSnapshot" ("orderId","tariffId","fee","details")
  VALUES ('schema-code-order','schema-tariff',0,'{"method":"POST_PISHTAZ_POSTPAID","shippingChargeMode":"MERCHANT_PAYS","shippingFee":0,"customerAccepted":true,"freeShipping":true,"policyRevision":"forged"}'::jsonb);
  RAISE EXCEPTION 'New merchant-paid snapshot was accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
INSERT INTO "OrderShippingSnapshot" ("orderId","tariffId","fee","details")
VALUES ('schema-code-order','schema-tariff',0,'{"method":"POST_PISHTAZ_POSTPAID","shippingChargeMode":"RECIPIENT_AT_DELIVERY","shippingFee":0,"customerAccepted":true}'::jsonb);
SQL
before=$(psql -XAtc "$query")
checkout_before=$(psql -XAtc "$full_query")
shipping_query=$(cat <<'SQL'
SELECT jsonb_build_object(
 'tariffs',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "ShippingTariff" t),
 'snapshots',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "orderId") FROM "OrderShippingSnapshot" t));
SQL
)
shipping_before=$(psql -XAtc "$shipping_query")
echo 'PASS PR35 repeated upgrades preserve receipts and retired history; code-only proofs work; new merchant-paid snapshots are rejected'

archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
pg_dump -Fc --no-owner -f "$archive"
pg_restore --list "$archive" > /dev/null
createdb motif_schema_restore_test
PGDATABASE=motif_schema_restore_test pg_restore --exit-on-error --no-owner --no-privileges -d motif_schema_restore_test "$archive"
[[ "$before" = "$(PGDATABASE=motif_schema_restore_test psql -XAtc "$query")" ]]
[[ "$checkout_before" = "$(PGDATABASE=motif_schema_restore_test psql -XAtc "$full_query")" ]]
[[ "$shipping_before" = "$(PGDATABASE=motif_schema_restore_test psql -XAtc "$shipping_query")" ]]
echo 'PASS PR35 full restore retains new evidence columns, private receipt bytes, bank code and immutable shipping history'
echo 'PASS PostgreSQL 18.4: full custom-format dump restores legacy and checkout data, including private receipt bytes'
