-- Manual compatibility upgrade only. Never run against production without owner approval.
-- Allows zero collected shipping ONLY for an explicit recipient-paid-postage snapshot.
BEGIN;
ALTER TABLE "OrderShippingSnapshot" DROP CONSTRAINT IF EXISTS "OrderShippingSnapshot_fee_check";
ALTER TABLE "OrderShippingSnapshot" ADD CONSTRAINT "OrderShippingSnapshot_fee_check" CHECK (
 "fee">0 OR (
 "fee"=0 AND ("details"->>'method') IS NOT DISTINCT FROM 'POST_PISHTAZ_POSTPAID'
 AND ("details"->>'shippingChargeMode') IS NOT DISTINCT FROM 'RECIPIENT_AT_DELIVERY'
 AND ("details"->'shippingFee') IS NOT DISTINCT FROM '0'::jsonb
 AND ("details"->'customerAccepted') IS NOT DISTINCT FROM 'true'::jsonb
 )
);
COMMIT;
