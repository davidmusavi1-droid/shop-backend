# Stage-aware MOTIF AI quota

This change is not production activation. No schema changes or migration are needed; lifecycle evidence lives in existing SmartAiRun usage JSON and status text. Keep current production flags and quota unchanged until this PR is approved and deployed.

## Accounting

- A cost preview or its cancellation sends nothing and reserves nothing.
- Execution reserves one slot under the existing PostgreSQL advisory lock. Validation/quote checks and request-body preparation happen before the provider fetch boundary.
- The real provider durably marks dispatch immediately before its single fetch. If cancellation, preparation failure or a failed marker prevents fetch, internal local evidence releases the reservation and estimated budget. A released record is retained, with its original lifecycle history; its unique scope is retired so a new explicit manager action can request a fresh quote. No retry is scheduled.
- A reservation still durably marked reserved after five minutes can be reclaimed under the quota lock on the next reservation attempt, using a compare-and-set. A suspended worker then fails its dispatch transition and cannot send. Legacy or dispatching rows are never reclaimed this way.
- Once fetch may have started, HTTP failures remain failed and counted. Timeout, disconnect and abandoned dispatches remain unknown and counted. A missing provider cost is never reported as a zero charge. Legacy failures without dispatch evidence remain unknown and counted.
- A successful provider response followed by a dossier revision conflict remains counted and retains the result/cost on the run. Failed commit acknowledgement cannot overwrite a committed completion.
- This release intentionally offers no manual button or client-submitted claim that frees a possibly sent request. We have no verified Liara request-status/billing reconciliation API in this codebase. Such requests remain held until a trusted provider reconciliation path is implemented; an HTTP error, timeout, admin checkbox or elapsed time is not proof of non-billing.

## Limits and money

Production configuration never permits more than **20 combined Gemini/Sonar requests/day**, or more than **40,000 toman/day of accounted estimates/actuals**. Smaller configured limits remain respected. UTC day boundaries are shown in the panel. The panel separately shows initiated, successful, failed, unknown, pre-dispatch reserved and released counts, remaining quota, reported actual USD/toman costs, estimated costs and the reserved budget. Initiated counts include released attempts; used quota excludes only proven pre-fetch releases.

Set explicit non-secret estimates before activating after approval:

- `MOTIF_C22_VISION_ESTIMATE_TOMAN`: conservative estimate for one permitted image analysis.
- `MOTIF_C22_RESEARCH_ESTIMATE_TOMAN`: conservative estimate for one Sonar research including search fees.
- `MOTIF_C22_DAILY_BUDGET_TOMAN=40000`.
- `MOTIF_C22_DAILY_LIMIT=20`.

No unverified prices are hardcoded for each request. Missing per-operation toman estimates fail closed. Optional existing USD estimates/budget remain an additional constraint. There is no implicit exchange-rate conversion. Known provider costs can increase the reserved amount; unknown costs retain the original estimates. The 40,000-toman gate is an application accounting/estimate limit, **not a guaranteed provider invoice ceiling**: reported actuals can exceed prior estimates. A true billing cap requires provider-side enforcement if offered, plus conservative estimates and review of actual usage.

No API key is exposed, no protected product fields are changed, and no automatic paid retry is implemented. No provider calls are authorized merely by opening this PR. Deploy/activation remain separate owner actions.

## Verification

Targeted offline tests cover cancellation before and just after the durable marker, marker failure, one-call HTTP errors/timeouts/disconnects/malformed output, ambiguous legacy attempts, uncertain commit acknowledgement, 20-request and 40,000-toman independent limits, estimate quote binding and missing estimates. Existing synthetic integration now exercises an aborted HTTP request before fetch, one sent timeout, duplicate blocking and two concurrent requests competing for the final daily slot. All provider/storage effects are local fixtures in the existing CI job; no new cloud test environment or external paid calls.
