# MOTIF opening checkout completion — 2026-11-27

Based on main at 7993811b1b945b65bc8f60d232a11d37077909fc (PR34 merged). This proposal supersedes the universal postpaid policy in PR32 for new orders only.

## Proposed behavior

- Card transfer: receipt image, 6–40 digit bank tracking code, or both. Persian/Arabic digits normalize. At least one is enforced in API and database. Codes and normalized image digests have unique indexes; exact same-order replay is accepted, changed evidence conflicts. A duplicate reference across banks can require support/manual investigation: do not discard the original evidence or assign an invented reference.
- Existing receipt-only rows stay accessible. Images are decoded/reencoded to JPEG with the existing 3 MB / pixel caps, held privately in PostgreSQL, and downloadable only by authenticated admin with no-store/nosniff. The order list returns presence and tracking code, never image bytes or digests.
- Initial reservation is 30 minutes, including courier after acceptance. Expired evidence is rejected after the durable order lock. Any recorded evidence retains inventory until manual actual-bank verification. Approval does not deduct stock again; rejection releases once. No automated expiry of an uncertain payment.
- A PostgreSQL-serialized maximum of 3 newly created orders per mobile per rolling hour applies in production; idempotent replay consumes no additional quota. This is an abuse bound, not proof of mobile ownership. OTP launch readiness remains separate.
- Strict threshold: greater than 5,000,000 toman is free for Pishtaz and city-of-Karaj courier; exactly 5,000,000 is postpaid. Tehran courier is always postpaid. Courier still requires support availability/ETA confirmation and explicit offer acceptance.
- Online payment contains goods only. Postpaid courier fare is explicitly offered and paid to courier at delivery. Postal fare is determined/collected by Post, not shown as zero/free. Free orders have merchant-paid mode and zero customer postage.
- Admin can configure threshold, postal/Karaj free rules and destination-specific ETA text. Postal free service has separate real evidence and expiry (maximum 90 days); without it above-threshold postal checkout fails closed. Existing recipient-paid Post approval is still required. Neither approval is seeded by this PR.
- Policy revision, charge mode, ETA, terms, destination and customer acceptance are snapshotted. Existing orders are not repriced.
- Cart includes a destination/method-aware progress bar; Tehran courier has no free incentive. Three public server-rendered guide routes share current settings and MOTIF styling: /shipping-guide, /payment-guide, /tracking-guide. Tracking availability is reported honestly.

## Image dependency security

The isolated production dependency audit identified the existing sharp 0.34.x range as high severity (GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w). This PR pins sharp 0.35.5, the patched release, rather than silently retaining a known image-parser vulnerability. References: https://github.com/lovell/sharp/releases/tag/v0.35.5 and https://github.com/advisories/GHSA-wq5f-xc86-pv6w . Deployment requires a Node-API v9 compatible runtime (Node >=20.9) and compatible prebuilt libvips platform; confirm the Liara runtime before release. The final audit report is retained with CI evidence. An audit with no findings is not a full security certification.

## Validation

- Local targeted policy/payment/OTP regressions: 32 passed. No real gateway, SMS, AI, postage or carrier request.
- Database, Express and browser checks are automated in the PR's isolated PostgreSQL18.4 CI. Final results and links must be checked on the final commit; do not infer success from local unit checks.
- New isolated integration covers code-only/image-only/both, simultaneous exact replay, conflicting and cross-order duplicate evidence, private image access, repeated approval/rejection, amount mismatch, expired evidence, held/released inventory, threshold boundary, absent postal approval, stale admin revision, immutable snapshots, mobile quota, closed production checkout and 320/1280 layouts.
- Existing Zibal reconciliation/retry and mock OTP checks continue to run; no manual successful workflow rerun requested.

## Rollout gates — not performed

1. Review final PR CI and SQL against a fresh authorized production backup. Run compatibility review; existing shipping/payment tables must already be present. Historical receipt digests are backfilled; if duplicate historical receipt bytes exist the migration rolls back for human investigation, without deleting/merging evidence.
2. Separately approve manual db/add-payment-evidence.sql, then db/add-shipping-policy.sql. These are additive/constraint upgrades, not startup migrations. Run only after testing restore; never rerun the older postpaid constraint after the new shipping-policy constraint.
3. Deploy only with owner approval. Keep existing public-checkout, live-gateway and SMS flags unchanged/disabled. Do not use old application code that assumes every card proof has a receipt after code-only records exist.
4. Obtain postal-office confirmation for recipient-paid shipments AND merchant-paid/free postage. Enter real references/validity via authenticated panel. Synthetic CI evidence must never be copied.
5. Owner verifies destination ETA estimates against practical fulfillment, support contact, destination card, shipping funding, and courier availability.
6. Kavenegar approved template/permission and explicitly authorized real SMS test remain launch requirements. Mock tests do not establish SMS delivery.
7. Owner approves any future real payment pilot and public activation separately.

No merge, production SQL/configuration, deployment, real bank transaction, paid SMS, SnappPay integration, or public activation is part of this PR.
