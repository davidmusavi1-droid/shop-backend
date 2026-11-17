# MOTIF smart panel — Phase B

## Isolated setup

Use Node.js 22, PostgreSQL 16 and a disposable loopback database owned by the local role `motif_smart_test`. Use a database named `motif_smart_test` or `motif_smart_test_<suffix>`. The Phase B endpoint binds to loopback and checks the URL, role and connected database before schema preparation. The database URL and admin token belong only to this environment.

From the repository root, set a test database URL for the disposable database and then run:

```bash
export MOTIF_SMART_PANEL=test NODE_ENV=test PORT=4189
export ADMIN_ORIGIN=http://127.0.0.1:4189
export ADMIN_TOKEN="smart-test-$(openssl rand -hex 24)"
# Set DATABASE_URL in this shell to the disposable database connection.
# Example shape: postgresql://motif_smart_test:<test-password>@127.0.0.1:5432/motif_smart_test
npm install --no-package-lock
npx prisma generate
node scripts/smart-panel-test-setup.cjs
node src/server.js
```

Open [the local panel](http://127.0.0.1:4189/smart-panel/) and enter the test token from the same shell. Start at **افزودن محصول جدید**. The dashboard starts with the records in the test database. Create a draft, add JPGs, fill the fields and open **بازبینی و تأیید نهایی**. The five-step wizard and **نمای یک‌صفحه‌ای** share the approved RTL components. Design baseline: `MOTIF-Prototype.html`, SHA-256 `61e3534f04b2f01e5d236dc4c0dd2916a4e482ec5fcd370c9fd54c1ad23b24ee`.

Do not put production values in the test shell. The test guard rejects production mode, external database endpoints and cloud credentials. Test DDL is outside the deployment migration chain. `.smart-panel-test/` contains private, per-test-database JPG storage and is excluded from Git. The test database and this directory can be backed up together if the fixture needs to be kept.

With the same environment and the test server running:

```bash
npm test
node --test test/smart-panel-integration.cjs
npm install --no-save --no-package-lock playwright@1.56.1
npx playwright install chromium
node --test test/smart-panel-browser.cjs
```

Set `CHROME_BIN` to use an existing Chromium executable. The integration tests create their own synthetic records and leave evidence in the test database. The branch workflow runs the same suites on disposable PostgreSQL 16 and a standard GitHub-hosted runner.

## Data and state

| Model | Purpose |
| --- | --- |
| `SmartDossier` | UUID independent of official code, monotonic version, phase, proposed code, approved revision and retirement reason. Payload contains allowlisted fields, AI mock results, content, ordered gallery IDs/groups and main image. |
| `SmartCode` | Unique official code and unique dossier association. The row survives retirement. The relation sets its dossier reference to null if the underlying dossier is physically removed. |
| `SmartImage` | Immutable dossier ownership, UUID, name, exact byte size and SHA-256. Local filesystem stores the unchanged final JPEG. |
| `SmartApproval` | Immutable revision snapshot of official code, fields, text approvals and gallery references. |
| `SmartEvent` | Timestamped operations, record version and a pseudonymous session tag. Event responses omit the tag. |

The database compares each write to the expected revision. The approval transaction reserves the code and stores the snapshot and event together. A material edit returns the dossier to draft, with its existing reservation and previous snapshots retained. Archive and logical delete remove the record from active views and keep the code reserved. Gallery removal unlinks the image from the active dossier and keeps its bytes private for historical snapshots. Test cleanup can remove the entire disposable database and its image directory together.

The legacy `Product`, `Variant`, SKU, catalog and WebP upload retain their existing code paths. A Phase B approval checks normalized codes from legacy test rows. At future rollout, migrate verified existing codes into the registry and make both legacy and new writers use the same transactional reservation before allowing publish. That cutover must reconcile uncoded, conflicting and historical records read-only first. Existing products' categories, variants, stock and prices require explicit mapping. Store flat waistband width and circumference separately. Stock zero gives no sale conclusion.

## API

Base `/api/admin/smart-panel`. Uses the existing admin session cookie and Origin/CSRF checks on writes. Successful dossier responses include `id`, `version`, `phase`, `approvedVersion`, `code`, `reserved`, `publication`, `sale`, editable fields and a private gallery. `VERSION_CONFLICT` returns 409, `CODE_TAKEN` returns 409, and `INCOMPLETE` returns 422 with field keys.

| Request | Contract |
| --- | --- |
| `GET /dossiers?after=<id>` | Up to 50 active records and a next cursor. |
| `POST /dossiers` | `{ id }` with client-generated UUID. Reusing the ID retries creation without a duplicate. |
| `GET /dossiers/:id` | Current dossier. Retired records are inaccessible here. |
| `PATCH /dossiers/:id` | `{ version, fields, code? }` with a patch of allowed values. Empty drafts and provisional codes are allowed. |
| `POST /dossiers/:id/images?imageId=<uuid>&name=<filename>&version=<n>` | Raw `image/jpeg`, maximum 3,000,000 bytes. A repeated attached ID with matching content returns the existing result. |
| `GET /dossiers/:id/images/:imageId` | Private JPG, conditioned on valid session, dossier ownership and active association. |
| `PATCH /dossiers/:id/images` | `{ version, gallery: [{ id, groups }], mainImage }`. Order is array order. Omitting an ID removes the active association. |
| `GET /codes` | Durable reservations and current legacy codes from this test database. |
| `POST /dossiers/:id/review`, `POST /dossiers/:id/approve` | `{ version }`. Approval validates readiness and reserves the normalized code. |
| `POST /dossiers/:id/archive`, `DELETE /dossiers/:id` | `{ version }` and logical retirement. The code remains reserved. |
| `POST /dossiers/:id/ai/analyze`, `POST /dossiers/:id/ai/research` | `{ version, provider?, simulateFailure? }`. Phase B supports `mock` and `disabled`. |
| `POST /dossiers/:id/ai/accept` | `{ version, key }` with an explicitly selected proposal linked to an active image. |
| `POST /dossiers/:id/content/:index` | `{ version, approve }` for an individual text section. |
| `GET /events` | Latest 100 recorded operations. |
| `POST /dossiers/:id/queue`, `POST /dossiers/:id/publish-test` | Reserved Phase D routes. Return `PHASE_D_REQUIRED` in this phase. |

## Review notes and next phases

- Browser storage keeps pending text/field edits per tab and test-admin scope. Recovery compares them against current server values and requires an explicit save. The local profile is not an encrypted vault. Photos that never reached the server must be selected again. The initial UI fetches all pages for client-side dashboard counts and filters. Larger catalogs will need server-side filtering/counts and a retention policy for old JPGs and revisions.
- The approved layout, colors, font assets, RTL navigation, wizard and one-page editor were reused. Changes include login, real empty states, a conflict/recovery view, separate optional circumference, explicit archive, and mock AI controls. Publication pages show Phase D status. A local loopback URL requires the test server.
- Private reads use dossier membership and the existing single-manager session. Multi-manager permissions and attribution require individual accounts. Failed writes with unknown database outcomes can leave a private orphan file. Production storage requires recovery/cleanup procedures, quota, backup restore, object-level access checks and a private staging bucket.
- **Phase C:** first evaluate Liara AI with synthetic label fixtures, verify actual JPG input, OCR, sourced results, latency, outage behavior and data retention. Establish test and monthly cost ceilings before enabling a provider. Implement real adapters behind the interface in `providers.js`. Load only authorized image bytes from the storage adapter, enforce field-level provenance and keep new proposals separate from manager values. No external calls are made by Phase B.
- **Phase D:** add persistent publish jobs with approved revision ID, a stable operation key, and separate requested/sending/result transitions. Use a test-only publisher with a verifiable receipt. Exercise timeout before and after persistence, duplicate clicks, crash recovery and retry without duplicate catalog products.
- Obtain separate approval before provisioning a paid resource, activating real AI, reading/exporting protected production data for reconciliation, changing production schema, connecting a live publisher, merging into `main` or deploying to Liara.
