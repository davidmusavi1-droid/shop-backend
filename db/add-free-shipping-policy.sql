-- Apply after add-shipping-policy.sql, before deploying the new checkout.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- FK target for merchant-paid postage. This is an accounting reference,
-- not a shipping tariff or confirmation of recipient-paid postage.
INSERT INTO "ShippingTariff" (
  "id", "source", "carrier", "originProvince", "originCity", "validFrom", "validUntil", "rules"
) VALUES (
  'motif-prepaid-post-pishtaz', 'MOTIF origin postage', 'POST_PISHTAZ', 'البرز', 'کرج',
  TIMESTAMP '2026-01-01', TIMESTAMP '9999-12-31', '[]'::jsonb
) ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "OrderShippingSnapshot" DROP CONSTRAINT IF EXISTS "OrderShippingSnapshot_fee_check";
ALTER TABLE "OrderShippingSnapshot" ADD CONSTRAINT "OrderShippingSnapshot_fee_check" CHECK (
  "fee">0 OR ("fee"=0
    AND ("details"->>'method') IN ('POST_PISHTAZ_POSTPAID','COORDINATED_COURIER')
    AND ("details"->'shippingFee') IS NOT DISTINCT FROM '0'::jsonb
    AND ("details"->'customerAccepted') IS NOT DISTINCT FROM 'true'::jsonb
    AND (
      ("details"->>'shippingChargeMode')='RECIPIENT_AT_DELIVERY'
      OR (
        ("details"->>'shippingChargeMode')='MERCHANT_PAYS'
        AND ("details"->'freeShipping')='true'::jsonb
        AND ("details"->'shippingDueAtDelivery')='0'::jsonb
        AND jsonb_typeof("details"->'freeShippingThreshold')='number'
        AND jsonb_typeof("details"->'goodsTotal')='number'
        AND ("details"->'freeShippingThreshold')>'0'::jsonb
        AND ("details"->'goodsTotal')>=("details"->'freeShippingThreshold')
        AND ("details"->'totalPrice')=("details"->'goodsTotal')
        AND CASE "details"->>'method'
          WHEN 'COORDINATED_COURIER' THEN ("details"->'courierDueAtDelivery')='0'::jsonb
          ELSE "tariffId"='motif-prepaid-post-pishtaz'
        END
      )
    )
  ) IS TRUE
) NOT VALID;

DO $$
BEGIN
  ALTER TABLE "OrderShippingSnapshot" VALIDATE CONSTRAINT "OrderShippingSnapshot_fee_check";
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'Legacy snapshots retained; the constraint is enforced on new rows';
END $$;
COMMIT;
