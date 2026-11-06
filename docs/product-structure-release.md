# MOTIF product structure — release procedure

This branch is for review only. Do not merge or deploy until the owner approves production release. Liara remains the sole image provider. No production mutation or backup has been performed from this workspace.

## Existing live records (read-only observation, 2026-11-06)

The public API returned two products. EIDER / MOTIF-004: 2,350,000 toman, product and variant grade B, 4 primary images, stock 1. Nike: 3,850,000 toman, product grade A_PLUS and variant grade N, 4 primary images, stock 1, no product code. Neither value is to be inferred, assigned or changed. The old type and customerNeeds tags remain intact. The public API is not a full database backup and cannot reveal unpublished products.

## Before any production migration

1. Use a trusted environment with Liara database and bucket read access, `pg_dump` / `pg_restore` matching the PostgreSQL server major version, Node dependencies, and the production DATABASE_URL supplied securely. Pause admin edits and order creation for the backup/comparison window; the dump and JSON export are separate snapshots.
2. Run `BACKUP_DIR=/secure/backups npm run db:backup`. It creates a custom-format **full** database dump, raw Product/Variant JSON (works before migration), copies every referenced original and defect image, and records SHA-256 hashes and reference mapping. It refuses to write inside the repo. Any failed download or dump means the backup is incomplete.
3. Restore `database.dump` with `pg_restore --exit-on-error --no-owner --dbname "$ISOLATED_DATABASE_URL" /secure/backups/.../database.dump` into a **new empty isolated database**. Verify product/variant IDs, counts, all prices, stocks, grades, original image arrays and image hashes against JSON and manifest. Check images can be reopened. Mark restore validation in the secure manifest. Never publish backup files or credentials in GitHub.
4. Inspect actual schema drift first: compare an isolated restored database to `20261106000000_baseline/migration.sql`. Existing production was managed with db push and additive SQL and has no migration history. Stop on any difference; do not run `migrate reset` or `db push --accept-data-loss`. If waistWidthCm is missing, inspect and apply the existing additive SQL in the isolated restore before comparison; do not reinterpret waistCm.
5. Only after schema equivalence is confirmed, baseline the **existing** database with `npx prisma migrate resolve --applied 20261106000000_baseline`. This records history; it must not recreate tables. A new empty test database instead runs `prisma migrate deploy` normally.
6. Apply `npx prisma migrate deploy` to the isolated restore, then test the branch there. All added fields are nullable/defaulted; no UPDATE/DELETE/TRUNCATE or automatic recategorization/grade conversion occurs. Existing URLs, IDs and SKU relationships stay unchanged.
7. Obtain final owner approval. Repeat a fresh verified backup immediately before the production migration, baseline only if needed, apply the additive migration and deploy the matching code. Check `/health`, both old product URLs and all old fields/images. Compare raw records excluding only new defaulted columns. Keep old image objects; removing an image reference never deletes storage objects.

## Rollback

Before any production use, keep the previous code release. For a code rollback, redeploy it and **leave the added columns in place**; it ignores them. Do not drop the new columns after new records have been written. A full database restore is an emergency recovery operation requiring a maintenance window and reconciliation of orders created after the backup; it is not a casual rollback command.

## Structure and compatibility

- Existing productType is the extensible primary category (initial suggestions: کاپشن، شلوار، سویشرت). Legacy values remain selectable. No automatic mapping of old product types or tags.
- Independent fields: mainFabric, complementaryFabrics, garmentDesign, hasHood, seasons, uses, fabricTechnology, technologyVerified, technologyEvidence, fabricNote. Gore-Tex cannot be submitted as a fabric; a real technology claim requires explicit manager verification and evidence. Uncertain descriptions belong in fabricNote. Hiking belongs in uses/design.
- Measurements stay on variants; sleeveFromNeckCm is added and displayed, never included in upper-body matching. Existing circumference and flat waist remain separate, editable fields.
- Dedicated defectImages and itemDefectImages are separate arrays from images/itemImages. Drafts may be incomplete. Publishing a nonblank product or variant defect requires the matching dedicated array. Grade B without a specified defect needs no defect image. New admin entries require a primary category; older API clients may still omit it for compatibility. Existing variant grades still take precedence and remain manager-controlled.
- Old need links are preserved. New season/use attributes also match equivalent old need links. New filters use type/fabric/design/hood/season/use query parameters; repeat season/use parameters for AND matching. Product paths and canonical URLs remain stable.
- Prices remain integer toman in PostgreSQL/API; the editor accepts Persian/Arabic digits and separators and displays comma groups; storefront prices retain consistent Persian formatting.
- Photo output remains WebP at the existing 3,000,000-byte cap, accepting JPG/PNG/WebP input. Original blemishes are not retouched. Known storage failures are translated into distinct safe causes, without exposing provider secrets.

## Validation

`npm test`, `node test/structure-browser.cjs`, `node test/product-integration.cjs`, `node test/structure-integration.cjs`, and `bash test/migration-restore.sh` are the required checks. The integration workflow provisions disposable PostgreSQL; it must pass before release. Browser tests use mocked API unless explicitly labeled integration; they do not verify the real Liara bucket. The real bucket, production backup/restore, production migration and production mobile/desktop smoke test remain release gates.
