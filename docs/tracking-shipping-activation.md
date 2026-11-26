# MOTIF tracking and shipping activation
## Current rollout
No migration. Deploy with SMS and public checkout disabled. This prepares a provider; it does not assert real delivery.
## Official Kavenegar contract
https://kavenegar.com/rest.html#verifylookup (reviewed 2026-11-27).
POST https://api.kavenegar.com/v1/{API-KEY}/verify/lookup.json
Form fields receptor, token, template, type=sms; HTTP success plus return.status=200 and one positive messageid are required.
This acknowledges the request, not handset delivery. No automatic retry on timeout.
The official documentation requires an approved template and advanced service. Owner must review any subscription/upgrade cost before enabling it.
## Secure Liara configuration
KAVENEGAR_API_KEY: existing account key; never commit.
KAVENEGAR_TEMPLATE: approved template name; suggested motifTracking with text "MOTIF: کد پیگیری سفارش شما %token است. اعتبار ۵ دقیقه. این کد را در اختیار دیگران نگذارید."
MOTIF_TRACKING_OTP_SECRET: separate random secret at least 32 characters.
MOTIF_TRACKING_PROVIDER=kavenegar
MOTIF_TRACKING_SMS_ENABLED: absent/false until explicit owner approval for paid SMS.
Activation requires a separately approved owner-number smoke test, then an explicit operating budget decision. Never claim live SMS tested before this.
Limits remain: 5 minutes, 5 failures, 60-second resend, 3/phone/hour, 20 total/hour, PostgreSQL transaction lock; no plaintext token stored.
GET /api/checkout/tracking/availability exposes a boolean only. Pausing new checkout does not pause authorized OTP tracking.
## Shipping
Production read-only check: no active postpaid confirmation; do not fabricate it. Owner must ask the dispatch office in Karaj whether Pishtaz postage itself can be collected from recipients (not COD for goods), obtain a reference and validity, then register it in Admin > logistics > postpaid.
Online payment remains goods only; postage due at delivery is not a zero postage promise.
Courier support phone is read only from ShippingOperations.settings through admin logistics. It is currently blank and courier disabled. Owner must set their chosen public business support number in Admin > logistics > courier settings. Do not reuse a private number or hardcode it.
Courier eligibility is only Tehran city and Karaj city; manager quotes a fixed fee and customer accepts before online payment. Timers remain configurable (request 120, offer 30, reservation 30 minutes).
Tipax, card transfer, public checkout and Zibal live remain disabled.
## Rollback
Return app code to v49. Retain all order, payment, tracking and shipping records. Disable SMS gate immediately for send errors or excessive traffic; do not erase history.
