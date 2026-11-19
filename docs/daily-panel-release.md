# MOTIF daily panel: controlled release

Integration base: production v27, commit `c503c516bf12ca908d1082d6820663ab14c5a14a` (PR25 checkout plus PR28 administrator-only legacy order creation). Originally developed against v25 / `13e8be0`; v25 is no longer the default rollback target. The PR branch includes main; this is not permission to merge the PR into main.
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

For the first stage of 10 products/day at one Gemini + one Sonar call each, propose 20 combined requests/day. This remains a proposal: keep the current limit of 2 and both flags off. Expand to 40–100 requests/day only after reviewing actual cost and obtaining the owner's agreed budget. This count includes failed/uncertain reservations and is shared across all admins, using a UTC day. One operation per current dossier/image or research-subject scope is durable and cannot automatically retry.

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
3. Record the then-active Liara release ID, commit and AI/payment flags. On 19 November the observed healthy baseline is v27 / `c503c51`, deployed at 11:32:45 Tehran. Preserve PR25 and PR28 in both the release and rollback. Owner approves the new PR head and deployment separately.
4. Merge and deploy with AI flags off. Check only health, admin sign-in, one existing product/order read, and the new draft transfer path. Do not publish PUMA automatically.
5. After a separate budget/activation approval, configure estimates and enable a low-volume first stage for the manager; inspect usage before enabling the initial 20-request stage and later increasing it to 40–100. No new paid verification is authorized by this PR.
6. If storefront/data behavior regresses, stop further draft writes and leave both AI flags off. Roll back application code to the recorded v27 / `c503c51` baseline, preserving the checkout tables, payment settings and administrator-only legacy order guard. Never restore the entire v25 application as the default response: it predates PR25/PR28. The current production database is not restored or migrated backwards as part of an application rollback.
7. Product arrays continue to hold absolute image URLs. New JPG/PNG objects remain in object storage; the baseline public gallery renders their URLs without requiring WebP. Dossier JSON additions are additive and the original bytes remain in SmartImage. Baseline C2.2 cannot import new JPG/PNG storage URLs and does not correctly label newly imported legacy WebP originals. Therefore suspend the smart-panel interface (`MOTIF_SMART_PANEL=off`, only under approved rollback authority) while rolling back if these newly created dossier images exist; ordinary product management and public product galleries remain available. Do not delete new originals, receipts, orders, dossiers or tables. This is a controlled fallback with the intelligent workflow paused, not a claim that the older panel supports every new operation.
8. Confirm media coverage before requesting deployment approval: inventory product/variant/defect/site image references, retain original objects and their URL mapping, and verify a private recoverable media copy or independently verified retention mechanism. A PostgreSQL dump covers SmartImage bytes and media references, but not external object-storage image bytes. Do not claim that a successful SQL restore alone proves media coverage. Reuse the already verified SQL restore result; no new cloud restore service is required.

## Daily use limitations

- No throughput/load claim for 20–50 real products is made from a synthetic acceptance test; staging the budget and observing actual usage is still necessary.
- Gallery transfer adds originals; it deliberately does not silently mirror deletions between the dossier and the product. Review deletion/order in the product form.
- Source review and publication remain human decisions. A label number is research evidence, not proof of model-specific properties or authenticity.
