# Shipping icon presentation review

Based on main `a2f22cd8b3ab45df5ead4f50dafbb6c9b7e2bcb4`, including merged PR #36. No customer-guide copy, thresholds, quote/acceptance logic, payments, schema, or production configuration changed.

Eight Lucide symbols are served from the local `public/shipping-icons.svg` sprite: package, truck, bike, gift, clock, wallet, map-pin, package-search. Source: https://github.com/lucide-icons/lucide/tree/main/icons. ISC attribution is in `docs/lucide-LICENSE`. No runtime package or external icon request is needed. Decorative SVGs inherit text color, have fixed dimensions, are hidden from screen readers and do not receive focus. Existing Persian labels, native select and summary controls remain available. The method label switches between truck and bike through CSS; it does not change selection or checkout behavior. Guides also render with JavaScript disabled.

## Validation

- 16 existing shipping-policy/postpaid/parcel/cost tests passed locally.
- `test/shipping-icons-browser.cjs` passed with Chrome at widths 320, 390 and 1280: RTL, no horizontal overflow, exact guide paragraphs, cart goods total and inclusive free-shipping threshold, postal/courier icon switching, decorative accessibility attributes, keyboard focus, no browser exceptions and no-JavaScript guide rendering.
- Six full-page guide/cart screenshots were captured; representative mobile-guide and desktop-cart images were visually reviewed. CI publishes all six as `shipping-icon-responsive-previews`.
- Browser fixture uses local synthetic GET responses only; writes return 405. No real order, payment, SMS, database or production request is made.
- Full local unit run: 121 passed; 5 test files could not load missing application dependencies (`express`, `@aws-sdk/client-s3`). This is not a complete full-suite pass. Existing integration workflows remain required before merge.

## Release observation (2026-11-28)

PR #36 was merged. Its Railway deployment `ec9c61b8-0bd4-445b-a3bd-ec84777c7940` failed. Railway reported shop-backend online on successful deployment `4c08703f-951c-41fd-9012-a5c5b189077d` created 2026-11-06, with no pending staged/applying work. Therefore merged #36 must not be assumed live. No release retry or production changes were performed. This PR must remain unmerged and undeployed until separately authorized.
