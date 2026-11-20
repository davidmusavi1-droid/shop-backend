# Paid/unverified callback correction

Base: `f8687011a429f9b1132e2c93a456ecc9a8fa2914` (production v44 code).

## Cause

`evidence()` deliberately classifies a valid, amount-matched inquiry status 2
as REVIEW, not PAID. `inspect()` returned REVIEW and `verify()` exited before
its OPEN-only gateway verification branch. A genuine paid/unverified callback
therefore never reached gateway.verify. This is independent of the purchase amount.

## Correction

Only callback verification opts in to resolving a matched status-2 inquiry:
under the existing per-order durable lock, verify the same track, then inquire
again without recursive verification. Commit payment only on fresh result 100,
status 1 and the unchanged exact integer rial amount check. A verify result of
100 or 201, a transport timeout, or status 2 alone cannot commit success.
After a lost verify response, the fresh inquiry may still prove prior success.

The retry-request and expiration paths remain conservative. They do not invoke
this resolution and cannot issue a new track or release stock based on status 2.
All gateway calls retain the existing append-only sanitized audit. Settlement
retains its transactional compare-and-swap and never changes reserved stock.
No schema migration, production settings or amount conversion changes.

Contract references: https://help.zibal.ir/ipg/ and
https://github.com/zibalco/gateway-nodejs . The owner's supplied official support
responses confirm inquiry amount availability, status 1/2 payment evidence and
verify 201 requiring inquiry confirmation. The documentation endpoint timed out
during this review; this patch introduces no new API fields or inferred statuses.

## Targeted validation

`node test/zibal-retry-status2-postgres.cjs` runs the real Express callback router,
Prisma and the existing isolated PostgreSQL 18.4 CI service with synthetic data
and an injected network-free gateway. It covers status 1, status 2, status 11,
201, lost verification responses, amount mismatch/missing/string, late callbacks
for old attempts, concurrency, replay and stock preservation. It never requests
a payment or contacts a bank. Existing retry checks remain in their existing job.

## Limited release (separate owner approval required)

1. Confirm final commit CI and unchanged main; keep public checkout closed and
   `MOTIF_ZIBAL_PROVIDER=disabled`. No migration is required.
2. Merge and deploy only after owner approval; retain the v44 code/settings
   baseline for rollback. Verify HTTPS and disabled payment/public access.
3. Do not create another real order or track as a deployment check. A later live
   pilot needs separate approval of its exact order and total. Owner enters bank
   details. Require status-1 inquiry, one local successful payment and unchanged
   reservation deduction; disable the live provider after resolution.
4. On regression return application code to v44, keep live payments disabled,
   retain all payment attempts/audits and database data; do not restore an old DB.
