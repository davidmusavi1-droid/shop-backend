> Superseded policy notice (2026-11-21): Postex is no longer under consideration. All-inclusive customer-paid tariffs, owner approval and non-billing actual-cost variance reporting are described in [parcel-courier-readiness.md](parcel-courier-readiness.md). Historical provider research below is retained for reference only.

# Destination shipping readiness — 2026-11-20

## Decision and cost
Owner policy: all Iran; destination-dependent, final all-inclusive shipping shown
and accepted before payment. No extra charge after payment without a new agreement.
Legacy zero fee is NOT a real national tariff.

Recommended initial implementation: owner-approved, versioned destination table,
with a base rate for every one of 31 provinces and optional exact-city overrides.
This is the merchant's binding customer price, not a claimed live carrier quote.
The merchant must approve source, carrier/service, origin, inclusive costs and
absorbing any carrier difference. Limit each rate by item count and declared goods
value. Orders outside these limits are blocked instead of priced by guessing.
This local calculator adds no shipping API subscription/service. Actual carrier,
packaging, collection, tax/insurance costs must be included in the approved rates.

Official sources reviewed:
- https://postex.ir/service/api — advertises free API/modules and price inquiry.
- https://postex.ir/ — inquiry asks origin/destination, parcel size, grams and goods
  value; transport costs remain payable. No commercial agreement/account activated.
- https://tipaxco.com/transit-cost-calculator — official calculator linked by
  https://t.me/s/TIPAXCO?before=4141 ; origin/destination/weight/dimensions matter.
  Direct website retrieval timed out. No current API fee/contract assumed.
- https://parcelprice.post.ir/ — inaccessible in this review; no rates copied
  from unofficial calculators or old tariff PDFs.

An automated Postex/carrier adapter remains disabled until the owner selects a
carrier, origin city, packaging/weight rules and confirms commercial terms and
coverage. No API contract has been guessed; no customer data sent to a carrier.

## Implementation
Customer selects one of 31 provinces and chooses/types a city; suggestions come
from the approved tariff's city overrides, not an invented complete city dataset.
A province-wide base explicitly covers other cities in that province. Postal code
is normalized/format-validated; geographic address verification is not claimed.
The customer requests a quote after entering recipient information. Quote is a
read-only server calculation using DB prices, active tariff and destination.
No active/valid tariff, uncovered/oversized order, invalid input or changed quote
means no order/payment. A client amount or legacy shipping fee never authorizes
production pricing. An exact-city rule takes precedence over a province base.

Order creation recalculates within its existing stock transaction, checks the
customer-accepted tariff ID, shipping fee and total, and stores the immutable
source/rule/origin/destination/amount snapshot. Tariff changes between quote and
order require reacceptance; changing a tariff after order creation never reprices
that order. Replays return the original order. Public payment requests require a
matching stored shipping snapshot. Existing callbacks and historical orders are
not rewritten. Payment amount conversion and exact rial inquiry checks remain.

Admin uses authenticated session/CSRF routes to publish a new tariff version.
Requires a source, origin, inclusive-cost/merchant-difference confirmations,
positive integer fees, item/value limits, full province coverage and validity
of at most 90 days. Concurrent admin edits use revision checks plus a DB lock.
No real rates are seeded. Historical versions and order snapshots are append-only.

## Schema and release gates
db/add-destination-shipping.sql creates ShippingTariff, ShippingTariffState and
OrderShippingSnapshot, with restrictive FKs and immutable-history triggers. It does
not alter existing product, stock, order or payment columns/data. It is not in
production pre-start. Before production: fresh recoverable backup, live catalog
comparison, isolated SQL/restore checks and separate owner DDL approval. Preserve
all new tables/history on code rollback; do not restore an older production DB.

MOTIF_DESTINATION_SHIPPING=true enables destination mode in independent tests.
Production always requires it; no flag can revert production to legacy zero.
No production env, SQL, data, provider or public-access switch changed.

## IP review, read only
Liara motif-backend overview: egress 185.142.159.123.
Zibal MOTIF gateway / Settings / IP settings / Allowed IP addresses:
185.142.159.123. Match confirmed in both panels, no save/change performed.
No merchant credential or customer data is included here.

## Remaining owner decision
Choose carrier/service and origin, approve the source and inclusive destination
rates (plus valid period, parcel limits and handling/insurance). After approval
populate rates via secure admin; missing rates intentionally block checkout.
Card transfer remains off without destination account, SMS remains Mock/test-only.
PR32 remains Draft: no merge, deployment, real order, real charge or paid service.
