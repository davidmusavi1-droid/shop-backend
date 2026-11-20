# Controlled Zibal retries (draft, not deployed)

## Production observations, 2026-11-19

A read-only inquiry of the existing pilot returned result 100, status 11,
amount 1,000,000 rials (matching the 100,000 toman order), paidAt null and
verifiedAt null. Local order PENDING, payment unsuccessful, reserved variant
stock 0. Provider was `disabled` on v37. No production data or settings were
changed for this work. Do not publish the merchant or customer records.

## Confirmed contract

Official API: https://help.zibal.ir/ipg/#tag/استعلام-پرداخت

Official status mapping:
https://github.com/zibalco/zibal-wordpress-tourmaster/blob/master/tourmaster-payment-zibal.php
(status_codes: 11 = switch error; 1 = paid/verified; 2 = paid/unverified).

The owner's official support response confirms a track lifetime of 30 minutes,
release after that time ONLY with a valid pending (-1) inquiry, inquiry amount
always returned, and verify 201 requiring inquiry confirmation. Existing rial
conversion and amount equality checks are retained.

On 2026-11-20 the owner supplied a further official support reply: a transaction
cannot become successful after 30 minutes unless its status is already 1 or 2;
the previous transaction's information may be used to request a new trackId.
This resolves the status-11 finality blocker. No ticket identifier was supplied.
The policy now permits status 11 only after the full 30-minute track lifetime,
fresh result 100, an exactly matching integer rial amount, explicit null paidAt
and verifiedAt and no reference/payment evidence. Statuses 1 and 2 remain blocked
from retry. Unknown/error/missing/inconsistent responses remain blocked.
No extra finality environment override is needed. The entire retry engine still
defaults OFF behind `MOTIF_ZIBAL_RETRY_ENABLED`; this support reply authorizes no
production activation, deployment, migration or financial transaction.

## Storage, locking and reservation rules

- `Payment` remains one per order. `ZibalAttempt` and its first track are retained
  for v37 compatibility; a new ledger holds EVERY track independently.
- Three additive tables: ZibalPaymentAttempt, ZibalAttemptEvent, ZibalRetryGate.
  Events are append-only, enforced by a PostgreSQL trigger. Responses contain
  allowlisted reconciliation fields, never merchant/card/customer data.
- A durable order gate serializes request, retry, callback and release, including
  network I/O. A process crash leaves the gate locked: reconcile rather than
  automatically expiring a lease and risking a second charge.
- Unique track IDs, per-payment sequence, and a partial unique index prohibit
  multiple unresolved attempts. The request outcome UNKNOWN blocks new requests.
- Before a new track, inquire ALL previous tracks under the gate. Paid, unverified,
  amount mismatch, invalid, transport error and missing amount block retry.
- Existing pending (-1) can be reused before 30 minutes; after 30 minutes valid
  pending evidence can permit a new track while retaining the same stock hold.
- Status 11 requires a full 30 minutes since issue AND explicit null payment
  timestamps under the support-confirmed finality contract. No early retry.
- Maximum THREE tracks; a new request must start at least 30 minutes before the
  original order's 90-minute deadline. A successful request sets reservation to
  30 minutes from its issue, without deducting stock again. Unknown requests retain
  stock indefinitely for reconciliation. No blind timer releases such stock.
- `POST /api/payment/reconcile/:orderId` is admin/CSRF/pilot/key protected. Release
  requires fresh matching expired-pending inquiry for EVERY track, atomically
  cancels once and increments stock once. Status 11 never authorizes release.
- Late old callbacks are still looked up and reconciled, not ignored because a
  newer track exists. Contradictory paid evidence blocks subsequent requests and
  records success once. An already-issued bank session cannot be remotely revoked:
  this is why the provider's terminality guarantee is a release prerequisite.

## Controlled deployment proposal — requires separate owner approval

1. Review this Draft PR and targeted PostgreSQL 18.4 results. The status-11
   finality contract is confirmed above. No real request is allowed during preparation.
2. Keep live provider disabled and public purchase admin-only. Obtain a fresh
   recoverable backup, then separately approve/run `db/add-zibal-retries.sql`.
   It is never in application startup or automatic production migrations.
3. Deploy the approved commit with `MOTIF_ZIBAL_RETRY_ENABLED=true`, real provider
   STILL disabled; check readiness, admin gate and additive schema compatibility.
   Do not mix v37 and retry-enabled workers during a rolling deployment.
4. Reconcile the existing order. Check the original 90-minute window: it is not
   extended to revive an old pilot. If closed, report it and propose a new order.
5. Present the exact order ID and total cap again for separate payment approval;
   only then configure live and let the owner complete banking. Disable live again
   only after reconciling all outstanding tracks, retaining audit records.
   `MOTIF_ZIBAL_REQUESTS_DISABLED=true` separately closes request/availability
   while leaving configured callbacks and admin reconciliation available. Use
   this while draining tracks; it does not activate an otherwise disabled provider.

## Safe return to v37

v37 is code c503c516bf12ca908d1082d6820663ab14c5a14a with provider disabled.
This is a historical fallback, not an automatic downgrade target. Main advanced
to beca45c7efa4655099e5684584f4e8ff21524679 after PR30; before any future release
capture the actual healthy Liara deployment and its settings as the rollback
target so that newer store/AI changes are preserved. A downgrade to v37 requires
separate approval and evaluation of those newer changes.
Liara code rollback does NOT restore environment values. Disable live explicitly,
do not change any original variables, and roll back code only. Never drop the
new tables, erase tracks, release inventory manually or restore a backup over live
orders. v37 cannot reconcile new ledger tracks: if any are unresolved, retain a
retry-capable reconciliation instance with requests disabled, or postpone rollback
until they are conclusively resolved. It is not safe to claim full payment rollback
while new bank sessions are outstanding. Initial legacy tracks remain intact.

## Current evidence

First implementation commit: 71e233913010d926b76e3b674735bba989713421.
Targeted independent PostgreSQL run: https://github.com/davidmusavi1-droid/shop-backend/actions/runs/44588571670
(successful; final-head checks are linked in the PR).

## Targeted validation

Local: `node --test test/zibal-retry-policy.test.js` (4 cases).

Independent CI PostgreSQL 18.4: `.github/workflows/zibal-retry-checks.yml`, using
fixed synthetic credentials and a guarded `motif_retry` database. Installs the
existing checkout schema only as fixture setup; does not repeat Sandbox/browser
tests or contact a gateway. Covers failure, retry, concurrency, delayed callbacks,
201, amount mismatch, unknown request outcomes, stock preservation/release and
append-only audit enforcement. Existing required CI runs automatically on a PR;
do not manually rerun successful historical jobs.
