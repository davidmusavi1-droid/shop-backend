# MOTIF release investigation — 28 November 2026

## Hosting evidence

Read-only DNS queries on this date returned:

- `www.motifdress.com` CNAME: `denali.liara.cloud`.
- `motifdress.com` A: `185.142.159.123`.
- `motif-backend.liara.run` A: `185.142.159.123`.
- Domain authority: `ns1.liara.zone` / `hostmaster.liara.zone`.

The repository's `liara.json` targets app `motif-backend`, port 3000, build location `iran`. Historical repository evidence (`docs/public-checkout-launch.md`, 20 November) identifies Liara release v44 / f868701, but is NOT proof of the current release. DNS establishes Liara routing; a shared IP alone does not prove which app owns the custom domain. Current domain-to-app binding, release ID and commit still require the Liara panel.

Railway still has `motifdress.com` configured as a custom domain. That retained configuration does not override the observed public DNS and does not prove it serves production traffic. The earlier report attributing Railway's old successful deployment to the live MOTIF site is withdrawn.

## Actual Railway failure (separate from Liara)

Deployment `ec9c61b8-0bd4-445b-a3bd-ec84777c7940`, commit a2f22cd (merged PR #36):

- Build completed: Prisma Client v5.22.0 generated at 11:12:19 UTC.
- Pre-deploy `deploy:prepare` ran only `add-product-code.sql` and `add-site-content.sql`; both logged success at 11:12:29–30 UTC.
- Runtime repeatedly logged `Content schema preparation failed P2021`, starting 11:12:35 UTC.
- `/health` never became healthy; deployment failed at 11:14:06–07 UTC.

P2021 indicates a missing database table, but the log omits the table name. The catch label is broad: startup prepares product/content schemas and then queries AdminSession before listening. Therefore the exact missing table, a specific missing migration, and any missing environment variable are NOT established by this log. In particular, absence of PR #36 SQL is not proven to cause this startup failure.

Railway variable-name inventory (values not read): ADMIN_TOKEN, DATABASE_URL, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_CLOUD_NAME. This inventory belongs to Railway only. It cannot establish Liara settings.

## Liara verification blocker

No Liara connector was found. The installed UI tool stopped because it could not determine the current Windows browser URL confidently enough to enforce its policy. Public HTTPS reads also failed in this environment (web access unavailable; local HTTPS socket permission denied). No login, terminal command, setting edit, deployment, restart or database operation was performed through the panel.

Consequently there is no current Liara log, release, environment inventory or migration receipt. A Liara failure after PR #36 is not confirmed. The owner has been asked for the production-service link and failed-release log. Do not invent a Liara root cause from Railway evidence.

## Lowest-risk resolution path, pending evidence

1. Read Liara's binding for motifdress.com and www, current healthy release ID/commit, newest attempted release ID/commit and its build/runtime logs. Preserve the healthy release. Establish whether a PR #36 release was attempted at all.
2. Inspect only presence/validity of required settings in that service; never export secret values. Check DATABASE_URL points to the intended production database; NODE_ENV, PORT/start command and ADMIN_ORIGIN match the service configuration; ADMIN_TOKEN is present. Inspect checkout/payment flags without enabling them: MOTIF_CHECKOUT_PREVIEW, MOTIF_CHECKOUT_PUBLIC, MOTIF_ZIBAL_PROVIDER, MOTIF_ZIBAL_MODE, MOTIF_ZIBAL_REQUESTS_DISABLED, MOTIF_ZIBAL_RETRY_ENABLED and callback validity. Provider secrets remain private. Preserve the current public-purchase/payment gates.
3. Using a read-only database session, inspect migration receipts, required table/column existence and constraint definitions. Do not run the application as a diagnostic: startup itself executes additive DDL and can run reservation cleanup when preview is enabled. `prisma generate` is a build step, not proof that the database was migrated. `prisma migrate deploy` alone does not apply the standalone `db/add-*.sql` scripts.
4. Inventory prerequisite migrations and standalone SQL against the actual active schema. PR #36's `add-free-shipping-policy.sql` requires `add-shipping-policy.sql`; it inserts an accounting ShippingTariff reference and changes a snapshot constraint. That is a production write and was not executed. Review all prerequisites and existing schema before proposing any exact SQL.
5. Reproduce the observed error and proposed fix against an isolated synthetic database first. If an exact missing schema prerequisite is confirmed, prepare only that reviewed additive change with a verified backup/rollback plan. If a variable/start setting is confirmed wrong, prepare only the smallest correction. Do not use schema push/reset, seed shipping approvals, relax checks, activate public checkout, upgrade Prisma, or retry deployment as a diagnostic.
6. Obtain separate owner authorization for any production migration, setting change, restart or deployment. Verify the approved release with read-only health checks afterward. This document neither executes nor authorizes those operations.

Until the Liara evidence is available, the safe action is to preserve production and prepare the customer-copy PR. No definitive Liara fix or current release is claimed.
