# MOTIF C2.2 controlled release

The functional baseline is local commit `678e128`. The existing 320 px Chromium
scenario passed with synthetic data and fixed AI responses. Approval to review
this pull request does not authorize production actions.

## Release and activation

1. Before a separately approved production release, record the active Liara
   release ID and its source revision. Take a fresh full PostgreSQL backup and
   capture the referenced media or confirm a recoverable storage snapshot.
   Record timestamps and checksums, restore into an isolated database, and
   check product, variant and order data. The PR22 backup is historical.
2. Check production migration history and confirm there are no conflicting
   Smart* tables. The C2.2 migration adds six tables and indexes in one
   transaction. It does not change existing product or order tables.
3. For the approved rollout, leave `MOTIF_SMART_PANEL`, `MOTIF_C22_VISION`,
   `MOTIF_C22_RESEARCH`, and the C2 credentials unset on all replicas.
   The existing admin form and storefront remain available. Applying the
   reviewed migration and deploying the approved revision are separate from
   activation. Check service health and the existing admin workflow after rollout.
4. Activate only after a separate owner decision. Use an approved daily request
   count through `MOTIF_C22_DAILY_LIMIT`, and supply the scoped provider key
   through the Liara secret environment as `MOTIF_C2_API_KEY`. Configure
   `MOTIF_C2_BASE_URL` for the approved Liara AI project. Enable only the
   authorized operations with `MOTIF_C22_VISION=on` and/or
   `MOTIF_C22_RESEARCH=on`, then set `MOTIF_SMART_PANEL=store`.
   The cap counts reservations across both operations per UTC day, including
   failed attempts. It is a request cap, not a monetary cap. The provider
   credential stays server-side and duplicate reservations cannot dispatch twice.

## Disable or roll back

- To disable C2.2, unset `MOTIF_SMART_PANEL` and both operation flags and restart
  all app replicas. Confirm the smart-panel status endpoint is unavailable and
  normal admin access still works. If AI traffic must stop before replica
  restart completes, revoke the scoped AI key immediately. Requests already
  accepted by the provider may finish or be billed.
- To roll back code, switch to the recorded prior Liara release with the flags
  still unset. Keep the additive tables in place. The prior application does
  not use them. A code rollback does not undo text already saved by a manager.
- Restore a production database only as a separately approved recovery action.
  Account for orders and product changes made after the backup before restoring.
