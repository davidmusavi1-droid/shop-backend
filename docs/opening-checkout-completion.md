# MOTIF PR35 — final owner policy and release readiness (2026-11-27)

Based on main after PR34. The owner's latest instruction supersedes the earlier draft incentives. No merge or production release is authorized by this review.

## Current shipping policy

- Pishtaz is recipient-paid postage, at every basket amount. Postage is paid by the customer to Post at delivery and never included in the online goods charge. The actual ability to send recipient-paid parcels from Karaj still requires valid postal-office confirmation.
- Tehran and Karaj city courier require support-confirmed availability, agreed positive fare, ETA and explicit customer acceptance. The agreed fare is paid separately at delivery; online payment contains goods only.
- Tipax remains disabled. No threshold, automatic merchant-funded postage, free-delivery progress bar or remaining-to-unlock amount exists in the new-order flow.
- Existing stored incentive settings are ignored. The ETA-only admin API rejects the retired setting keys. Revision names change to invalidate unaccepted old offers; incompatible offers must be reissued.
- ETA text remains editable. The cart and three guides disclose the current policy. No new order can claim MERCHANT_PAYS. Historical snapshots are not repriced or removed.

## Preserved payment behavior

Private receipt image, 6–40 digit bank code, or both; at least one proof. Exact idempotent replay, cross-order duplicate protection, expiry checks and bank-amount verification remain. Initial reservation is fixed at 30 minutes; submitted evidence keeps stock for manual review. Approval never deducts again; rejection releases once. Existing payments and audit history are retained. Mock SMS only.

## Required manual SQL — not executed on production

1. Existing checkout, card, tracking, Zibal and destination/parcel schemas must already match main.
2. db/add-payment-evidence.sql: nullable receipt, optional bank code, receipt digest, unique indexes and evidence check. Historical bytes are preserved; hashes are backfilled. Duplicate historical images abort/roll back the upgrade for human investigation.
3. db/add-shipping-policy.sql: permits zero *collected* postage for recipient-paid postal/courier snapshots. Positive historical fees remain allowed. New merchant-paid snapshots are rejected. If retired-policy historical rows exist, the new constraint is NOT VALID for old rows but is still enforced on every new row; immutable history is retained. With compliant history it validates automatically. Inspect pg_constraint.convalidated before release.
4. Neither script is in application startup. Reapply is tested; do not run the older postpaid-only constraint after the new shipping constraint. No destructive down migration, payment deletion or old-database restore is an application rollback plan.

## Backup status and restore evidence

No recent production backup artifact, timestamp, restore record or backup-console evidence was available during this review. No production backup, SQL or restore was initiated. Production backup readiness is therefore **unverified and a release blocker**, not a successful check inferred from CI.

The isolated PostgreSQL 18.4 restore test now applies both PR35 upgrades twice, verifies an old private receipt and its backfilled hash, inserts code-only evidence, retains a retired merchant-paid historical snapshot while rejecting a new one, then runs pg_dump -Fc and restores into an independent database. It compares payment/order/stock/evidence and shipping snapshots. This proves the fixture's compatibility/restore path, not the freshness or contents of a production backup.

Before release, obtain a fresh full PostgreSQL18-compatible production backup, record completion time and successful restore verification in an isolated destination. Protect receipt/customer data and retain encryption/access controls. The old pg_dump17/server18 mismatch is not acceptable evidence of a successful backup.

## Validation and release gates

Final CI links and exact commit are recorded in the PR description. Essential coverage includes all amounts around the former boundary, both courier cities with agreed fares, ignored stale settings, rejected retired API input, disabled Tipax, absence of progress UI at 320/1280px, receipt/code/both, repeated and concurrent submission/review, expiry/hold/release, amount checks, unchanged history, mock OTP and Zibal callbacks.

sharp remains pinned to the patched 0.35.5 from the existing PR; verify Node >=20.9 / compatible Liara native image runtime before deployment. Dependency audit is evidence only, not a complete security certification.

A green PR can be reviewed for merge. Production release additionally requires verified fresh backup/restore, compatibility/catalog review, approved manual SQL, actual postal confirmation, owner-approved support/card/courier/ETA settings and owner authorization. Kavenegar approval and any real SMS/payment test remain separate. Public checkout and live gateway must remain off throughout this review.

No merge, deployment, paid SMS, real transaction, production configuration write, Post order or SnappPay integration was performed.
