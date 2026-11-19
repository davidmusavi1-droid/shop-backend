# MOTIF daily panel: controlled release

Base: production v25, commit `13e8be05b6c55a400be1816c82b9f1ec072cbbc3`.
This PR changes no Prisma schema or migrations. No production settings, records or AI calls are changed by preparing it.

## Manager workflow

1. Create a product with a unique code; save an incomplete inactive draft.
2. Open “تحلیل و تحقیق محصول”. Upload original JPG/PNG, each at most 3,000,000 bytes. Up to 24 dossier photos are supported; only the first four non-defect photos enter analysis. Reorder/group photos before analysis.
3. Review the one-request cost/usage preview and explicitly confirm an AI operation, if enabled. There are no background or automatic retries. Unknown suggestions stay unknown; review mapped Persian type/fabric before accepting them. No protected sales/measurement/grade/color fields are supplied by AI.
4. Review research sources, generate/revise text, or enter text manually. Approve each of the three sections separately. Editing a section revokes its own approval.
5. “پیش‌نمایش انتقال متن‌های تأییدشده” includes both manual and generated approved text. Existing product text is excluded and protected again on save. Confirm insertion, then save the parent product draft.
6. “پیش‌نمایش افزودن عکس‌ها به محصول” stages original public image objects after explicit confirmation, but does not save or publish the product. Existing product photos are retained. Review order/main photo/removal in the parent gallery, then save. Removing a reference never deletes stored originals. Legacy WebP images remain readable; import does not recompress them.
7. Final dossier approval records a snapshot; it does not publish a product. Publication is a separate manager action in the product form. Final approval and a new publication both require the canonical `MOTIF-001` format (minimum three digits, up to nine); numeric aliases such as `MOTIF-13` / `MOTIF-013` collide. Existing codes are never rewritten. Legacy noncanonical codes must be corrected explicitly by the manager before a new final approval/publication; normal edits to already published legacy records remain supported.

## AI capacity: proposal only, not applied

Keep the current `MOTIF_C22_VISION=off`, `MOTIF_C22_RESEARCH=off`, `MOTIF_C22_DAILY_LIMIT=2` until separate owner approval.

For 20–50 products/day at one Gemini + one Sonar call each, propose 40–100 combined requests/day. Start at 40; increase to 80/100 only with the owner's agreed budget. This count includes failed/uncertain reservations and is shared across all admins, using a UTC day. One operation per current dossier/image or research-subject scope is durable and cannot automatically retry.

Before enabling, set these additional **non-secret pricing estimates** in Liara after reviewing the current account tariff and typical image/token sizes:

| Variable | Meaning |
| --- | --- |
| `MOTIF_C22_VISION_ESTIMATE_USD` | Conservative USD estimate for one image analysis, including all selected images |
| `MOTIF_C22_RESEARCH_ESTIMATE_USD` | Conservative USD estimate for one Sonar request including search fees |
| `MOTIF_C22_DAILY_ESTIMATE_BUDGET_USD` | Daily USD budget for reserved estimates |

Do not enter unverified numerical prices as actual costs. No pricing estimate is hardcoded and missing pricing blocks paid execution. The panel shows one request, estimate, used/remaining count, reported actual cost and unknown-cost count before execution. Quotes expire after five minutes and bind the dossier version/operation. A changed dossier requires another preview, not an automatic retry.

The estimate budget reserves cost before sending under the same database lock as the request quota. Actual USD cost, when reported, can raise the amount accounted for. Unknown actual costs keep their reservation. **This is a limit on estimated expenditure, not a provider-enforced monetary ceiling:** a provider can charge more than the estimate. Use a provider-side cap if the account offers one and review actual costs before raising throughput. Toman and USD reports remain separate; no fabricated currency conversion is used.

The key/base URL stay in existing secure Liara environment settings. They are never returned by budget/quote endpoints. Turning both operation flags off blocks subsequent paid requests after the configuration restart. It cannot cancel an already sent billable request or stop the separate AI project plan's hosting fee. The panel has no background AI jobs.

## Necessary validation

- Focused unit/HTTP tests cover manual approvals, no overwrite, alias mapping, code collision, original bytes/MIME, limits, signed quote expiry and budget enforcement.
- `test/daily-readiness-integration.cjs` runs on synthetic PostgreSQL only (`motif_test` at loopback), injecting both AI and object-storage fixtures. It checks draft → upload/readback → analysis/research fixtures → mapped suggestions → previews → saved content/gallery → independent final approval. Optional `MOTIF_DAILY_BROWSER=1` covers the changed embedded flow at 320px. No remote AI is contacted.
- The existing Product management CI runs this targeted flow; no additional broad CI workflow is added. Existing required checks remain enabled.

## Release and rollback (owner approval required)

1. Confirm this PR's final commit and required CI results. Recheck current main/release for parallel payment work; do not merge stale assumptions about v25.
2. Verify a current recoverable production DB backup and media coverage using the payment/backup task's latest result; do not repeat an already successful restore rehearsal. Stop if backup/rollback coverage is unavailable. This PR needs no migration.
3. Record the then-active Liara release ID, commit and AI flags. Owner approves merge/deployment separately.
4. Merge and deploy with AI flags off. Check only health, admin sign-in, one existing product/order read, and the new draft transfer path. Do not publish PUMA automatically.
5. After a separate budget/activation approval, configure estimates and enable a low-volume first stage for the manager; inspect usage before increasing the count to 40–100. No new paid verification is authorized by this PR.
6. If storefront/data behavior regresses, disable AI, stop further writes and roll back to the recorded healthy release. Product schema is unchanged and existing image URLs remain compatible. Newly saved originals use JPG/PNG URLs supported by both v25's public gallery and this release. The v25 AI image importer still rejects new JPG/PNG URLs after rollback; management can continue while this importer limitation is resolved. Newly added JSON payload properties are additive. Existing records and originals must not be reset or deleted.

## Daily use limitations

- No throughput/load claim for 20–50 real products is made from a synthetic acceptance test; staging the budget and observing actual usage is still necessary.
- Gallery transfer adds originals; it deliberately does not silently mirror deletions between the dossier and the product. Review deletion/order in the product form.
- Source review and publication remain human decisions. A label number is research evidence, not proof of model-specific properties or authenticity.
