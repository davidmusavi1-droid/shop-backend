# MOTIF measured parcels and coordinated courier — 2026-11-20

Owner-approved scope: Karaj/Alborz origin; POST_PISHTAZ primary; TIPAX disabled; COORDINATED_COURIER only Tehran city/Tehran province and Karaj city/Alborz province. No production change is authorized.

## Measured parcels
- Admin records approved actual grams per variant, independent of clothing body measurements.
- An approved packing plan describes an exact variant/quantity composition, empty packaging grams and measured outside dimensions in integer millimetres.
- Multi-item weights sum item grams times quantity plus tare. No dimensional addition, assumed fit, guessed weight or volumetric divisor. Unrecognised compositions require a new actual packing measurement before a quote can be issued.
- Production always requires parcel metadata. Independent tests can opt in with MOTIF_PARCEL_SHIPPING=true.
- Internal POST_PISHTAZ tariffs now include weight ranges and maximum outside dimensions, in addition to destination/value/item constraints. Origin is fixed to Karaj/Alborz. Overlapping same-destination weight bands are rejected.
- Sources and all-inclusive final prices require explicit admin approval. Missing metadata, uncovered weight/dimensions or unavailable tariff blocks checkout. No zero fallback or real rate is seeded.
- Existing accepted order snapshots stay immutable; changes to measurements/tariffs cannot reprice them.

## Coordinated courier
- Initial customer request: AWAITING_COORDINATION, no stock reservation, no order, no payment.
- Default request expiry 120 minutes; configurable 1–1440 minutes in the authenticated/CSRF-protected admin panel.
- Admin confirms availability, address/city eligibility, all-inclusive courier fee and a delivery window, then creates an immutable numbered offer.
- Default offer validity 30 minutes and default reservation ceiling 30 minutes; each configurable 1–30 minutes. A quote never outlives its request. Settings changes do not extend existing requests/offers.
- The customer explicitly accepts the exact revision, goods total and shipping fee. Server rechecks measurements, packing, goods prices and stock. Proposal acceptance creates one order and reserves stock in the same transaction.
- Reservation ends at the earlier of offer expiry or configured reservation ceiling. Admin cannot silently extend it.
- Capability is 256 random bits, stored hashed server-side and sent in a header; it is not an order number/phone authentication shortcut. Access tokens and personally identifying payloads are excluded from admin output fields where not needed.
- Request key/hash, PostgreSQL advisory locks, unique order binding and existing checkout idempotency prevent concurrent/replayed acceptance creating another reservation/order. Limits persist in PostgreSQL (3 new requests/mobile/hour and 20/client-address/hour); replays do not consume another request.
- After a payment attempt exists, existing safe inquiry/reconciliation rules retain unresolved stock. Request/offer expiry cannot release that inventory.
- Support phone is an administrator setting; only the intended public support number is exposed. No hardcoded personal phone or SMS delivery.
- No unconditional same-day promise. Customer can refresh the protected request response in the same browser.
- Different payment methods continue to compete for the single Payment.orderId record; no gateway/payment code was weakened.

## Schema and deployment gate
New manual additive script: db/add-parcel-courier.sql, after db/add-destination-shipping.sql.
Adds ShippingOperations, ShippingMeasurement, ShippingPackingPlan, CourierRequest and immutable CourierOffer history. No existing product, stock, order or payment record is backfilled or rewritten. Production startup does not run it.
Prisma's new scalar metadata IDs intentionally avoid adding relation fields to existing product API responses. SQL installs restrictive foreign keys.
Before any production DDL: fresh recoverable backup, live schema comparison and separate owner approval. Keep new tables/history on code rollback. No merge, deploy or public/payment activation is authorized.

## Postex access investigation
Official API overview: https://postex.ir/service/api
Advertises free API/JSON/HTTP and rate inquiry; this does not establish free freight, collection, packing or account credit.
The public documentation link returns to the overview rather than a usable endpoint/authentication contract. Official store request route: https://postex.ir/dashboard/requests. In the inspected browser, the login/register control did not open a form.
No account, key, fee agreement, wallet top-up or shipping order was created. No customer information was transmitted. No Postex endpoint or money unit was guessed.
Remaining: owner access/sign-in if needed, documented rate-only credentials and confirmation of Pishtaz from the actual Karaj pickup address, inclusive fees, units, coverage and quote validity. Postex live adapter stays unavailable until this contract is verified.
Tipax remains disabled and cannot be selected or accepted server-side.

## Verification
Targeted test files:
- test/parcel-courier.test.js: measurement/packing validation, city eligibility, adjustable bounded durations and unavailable-rate rejection.
- test/parcel-courier-postgres.cjs: independently named local PostgreSQL18 fixture, real Prisma/Express, synthetic-only, repeated additive DDL via CI, actual weight rate, atomic/replayed/concurrent acceptance, invalid amount rollback, immutable offer history, expiry and unknown-payment stock retention, desktop1280/mobile320 customer workflow.
- Existing production-mode fixture now seeds synthetic measured parcels rather than bypassing the new production guard.

No previously successful run was manually rerun. CI jobs triggered by the new code are left intact.
