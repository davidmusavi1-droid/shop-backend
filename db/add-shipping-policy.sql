-- Manual compatibility upgrade only. No order, payment or shipping snapshot is rewritten.
-- New zero-collected-fee snapshots require recipient-paid postage/courier.
BEGIN;
ALTER TABLE "OrderShippingSnapshot" DROP CONSTRAINT IF EXISTS "OrderShippingSnapshot_fee_check";
ALTER TABLE "OrderShippingSnapshot" ADD CONSTRAINT "OrderShippingSnapshot_fee_check" CHECK (
 "fee">0 OR ("fee"=0
 AND ("details"->>'method') IN ('POST_PISHTAZ_POSTPAID','COORDINATED_COURIER')
 AND ("details"->>'shippingChargeMode') IS NOT DISTINCT FROM 'RECIPIENT_AT_DELIVERY'
 AND ("details"->'shippingFee') IS NOT DISTINCT FROM '0'::jsonb
 AND ("details"->'customerAccepted') IS NOT DISTINCT FROM 'true'::jsonb
 ) IS TRUE
) NOT VALID;
-- Validate when all historical rows comply. Retired-policy rows, if any, remain
-- immutable and readable; NOT VALID still enforces the rule for every new row.
DO $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM "OrderShippingSnapshot" WHERE NOT (
   "fee">0 OR ("fee"=0
   AND ("details"->>'method') IN ('POST_PISHTAZ_POSTPAID','COORDINATED_COURIER')
   AND ("details"->>'shippingChargeMode') IS NOT DISTINCT FROM 'RECIPIENT_AT_DELIVERY'
   AND ("details"->'shippingFee') IS NOT DISTINCT FROM '0'::jsonb
   AND ("details"->'customerAccepted') IS NOT DISTINCT FROM 'true'::jsonb
   ) IS TRUE)
 ) THEN
  ALTER TABLE "OrderShippingSnapshot" VALIDATE CONSTRAINT "OrderShippingSnapshot_fee_check";
 ELSE
  RAISE NOTICE 'Historical shipping snapshots retained; new-row constraint enforced but not validated against retired-policy history';
 END IF;
END $$;
COMMIT;
