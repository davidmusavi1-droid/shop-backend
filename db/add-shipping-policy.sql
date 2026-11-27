-- Manual compatibility upgrade only; historical snapshots remain immutable.
BEGIN;
ALTER TABLE "OrderShippingSnapshot" DROP CONSTRAINT IF EXISTS "OrderShippingSnapshot_fee_check";
ALTER TABLE "OrderShippingSnapshot" ADD CONSTRAINT "OrderShippingSnapshot_fee_check" CHECK (
 "fee">0 OR ("fee"=0
 AND ("details"->>'method') IN ('POST_PISHTAZ_POSTPAID','COORDINATED_COURIER')
 AND ("details"->>'shippingChargeMode') IN ('RECIPIENT_AT_DELIVERY','MERCHANT_PAYS')
 AND ("details"->'shippingFee') IS NOT DISTINCT FROM '0'::jsonb
 AND ("details"->'customerAccepted') IS NOT DISTINCT FROM 'true'::jsonb
 AND (("details"->>'shippingChargeMode')='RECIPIENT_AT_DELIVERY'
 OR (("details"->>'freeShipping') IS NOT DISTINCT FROM 'true'
 AND ("details"->>'policyRevision') IS NOT NULL
 AND (("details"->>'method')='POST_PISHTAZ_POSTPAID'
 OR (("details"->'destination'->>'province')='البرز' AND ("details"->'destination'->>'city')='کرج'))))
 ) IS TRUE
);
COMMIT;
