# MOTIF — recipient-paid Pishtaz postage (2026-11-21)
Current owner policy supersedes prepaid postal tariffs. No production activation is authorized.

- Primary method: POST_PISHTAZ_POSTPAID (پست پیشتاز ـ پس‌کرایه).
- Only goods are paid online; shippingFee=0 means zero collected by MOTIF, never free carriage. Actual carrier charge remains unknown (null), payable by the recipient to Post.
- Required customer text and explicit checkbox: هزینه ارسال بر عهده خریدار است و هنگام تحویل مرسوله به شرکت پست پرداخت می‌شود.
- Server prices goods from variants/products, checks explicit postpaid agreement and snapshots the accepted method/terms. No postal tariff, packing charge, insurance or margin is added to this method's online amount.
- Courier remains separate, limited to Tehran/Karaj city, with agreed all-inclusive fee paid before the gateway. TIPAX is disabled; Postex is removed.
- Weight/packing records remain available for fulfilment/courier; they do not calculate a postal checkout surcharge.
- Legacy prepaid orders/replays retain their original amount and immutable shipping snapshot. There is no repricing, manual stock release or payment-verification weakening.

## Real-service readiness gate
Official current evidence confirming recipient-paid Pishtaz carriage for this merchant from Karaj has not been obtained. The official post.ir site timed out during read-only verification; third-party descriptions do not establish actual service availability or contractual conditions.
The admin must record a genuine postal-office/contract confirmation and validity period (up to 90 days) in the dedicated postpaid form. The saved immutable policy is separate from legacy tariffs. Missing/expired confirmation blocks new postal checkout. No confirmation or real tariff is seeded.
This is postage paid by the recipient, not COD collection of the goods price. Confirm coverage, acceptance office, packaging/insurance handling and any return costs with Post before public launch. No automatic alternative carrier or unapproved fee is applied.

## Schema gate
db/add-postpaid-shipping.sql replaces only the known fee check constraint in a transaction:
- Existing positive shipping fees remain valid.
- Zero collected shipping is valid ONLY with explicit postpaid method, RECIPIENT_AT_DELIVERY mode, zero snapshot shippingFee and customerAccepted=true.
- Negative/arbitrary zero shipping is rejected.
- Immutable-history triggers and all rows remain intact.
The script is not in startup and has run only in independent CI. Production execution, merge, deployment and public activation still require separate owner approval and normal backup/schema review.

## Verification
Targeted unit/postpaid PostgreSQL tests cover absent confirmation, explicit agreement, no online shipping charge, rejected tampering, concurrent order replay, exact goods-only rial request, repeated callback, one paid record/stock deduction, and unchanged legacy snapshots.
The existing production-mode Express/Prisma/Mock gateway fixture now verifies goods-only amounts and explicit postpaid agreement in desktop/mobile browsers. Courier tests retain their own agreed fee.
