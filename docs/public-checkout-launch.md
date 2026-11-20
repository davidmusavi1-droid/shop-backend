# Public checkout preparation — 2026-11-20

## Observed production, read-only

Liara currently runs v44 / f868701, not PR31. PR31 remains Draft/unmerged
(abd98af); its existing three CI checks succeeded. A runtime source check confirms
that production lacks verifyUnverified. Provider disabled, checkout admin-only,
retry engine enabled, merchant present, exact HTTPS callback configured. No secret
values were copied. HTTPS /health, /, /collection, /cart and /admin.html returned
200; anonymous shipping returned 401, payment availability 503 as intended.
19 products / 19 variants / 3 orders. The approved successful synthetic order
remains PAID with one successful payment and stock zero. The older failed pilot
remains PENDING/unpaid with its reservation held; no state or stock was changed.
Card transfer is disabled with no destination account. Shipping currently zero.

## This Draft builds on PR31; no production activation

- Separate public customer-access switch, absent/off by default. Admin endpoints
  stay authenticated. Pilot configuration remains the default.
- Public provider configuration requires explicit public mode and the retry
  engine, retains fixed callback and secure merchant/transport validation.
  Request ownership still requires the saved unguessable checkout capability.
- Public callbacks resolve their own stored track/order instead of a pilot ID.
  All retry-engine settlement paths now require a fresh matched status-1 inquiry,
  including OPEN -> verify. PR31 supplies the paid/unverified resolution.
- Result pages distinguish confirmed, unresolved and failed/expired outcomes,
  advise against paying again while unresolved, escape and display order number,
  and include a mobile viewport. No customer address/phone is displayed.
- Browser pending-request fingerprints persist before submission, so a reload
  after a lost response reuses its idempotency key without storing customer data.
- Existing card-transfer independent approval/unique Payment.orderId protections
  remain. It must stay disabled until the owner configures a destination account.

## Required before public approval

1. Review this change and PR31, final targeted CI and customer browser evidence
   (320px mobile and desktop) for the final release. Production UI has not yet been
   exercised for public checkout; the live admin gate intentionally remains shut.
2. Confirm the intended real shipping tariff; the observed zero is not silently
   changed or assumed to be the owner's public tariff.
3. Review real SMS ownership tracking separately. Current tracking provider is
   test-only Mock and production tracking is disabled; do not advertise working
   SMS tracking or send real SMS without separate service/cost authorization.
4. Verify the live merchant's allowed egress IP from the current Zibal panel
   before activation. A prior successful transaction is evidence for that earlier
   time, not a new panel verification.
5. Verify reservation/payment reconciliation operations and the cross-method
   concurrency case before enabling both online and card-transfer methods.

## Activation proposal — only after explicit final owner approval

Deploy reviewed code with MOTIF_CHECKOUT_PUBLIC absent/false and provider disabled.
No schema migration is needed. Confirm the release hash, HTTPS, DB and admin gates.
Retain current merchant/callback secrets and known egress IP; never hardcode them.
After the owner approves public activation and the tariff, set
MOTIF_ZIBAL_MODE=public, MOTIF_ZIBAL_RETRY_ENABLED=true,
MOTIF_CHECKOUT_PREVIEW=true, MOTIF_ZIBAL_PROVIDER=live,
MOTIF_CHECKOUT_PUBLIC=true. Remove/ignore pilot order/cap only in explicit public
mode. Do not create a test transaction on production.

## Emergency stop / rollback

For an in-flight incident set MOTIF_ZIBAL_REQUESTS_DISABLED=true and
MOTIF_CHECKOUT_PUBLIC=false while retaining provider=live and mode=public: new
customer submissions stop, existing callbacks can still reconcile server-side.
Do not disable verification while payment outcomes are unresolved. After final
resolution the provider may be disabled. Return code to v44 only with new requests
closed, preserve matching safe environment settings and all new tables/history;
never roll back the database or manually release stock. The source audit of v44
shows the known status-2 defect, so it is a shutdown fallback, not a live-payment
fallback. Continuing observation is not a permanent background monitor unless a
separate scheduled task is configured.
