---
name: twin-code-cloud-ledger
description: Cloud-backed ledger sync for Twin Code — cross-PC duplicate prevention and run resumption on backup hardware
type: feature
---

# Twin Code — Cloud-Backed Ledger Sync

## Purpose
Prevents two PCs from printing the same serial in the same catalog ("lot"), and lets a backup PC resume an interrupted run on the original PC.

## Architecture
- **Tables**: `twin_code_runs` (one row per production run) and `twin_code_ledger` (append-only one row per printed/missed bottle).
- **Hard guarantee**: a unique index `(catalog_fingerprint, serial) WHERE outcome='printed'` on `twin_code_ledger` makes cross-PC duplication impossible at the database layer.
- **RLS**: Both tables are service-role-only. Clients talk through the `twin-code-ledger` edge function.
- **Edge function ops**: `claim`, `record-miss`, `run-start`, `run-update`, `run-stop`, `query`, `active-runs`.

## Client adapter (`src/twin-code/cloudLedger.ts`)
- Singleton with three modes: `best-effort` (default — local guard authoritative, cloud claim fire-and-forget), `strict` (cloud must confirm or the bottle is missed), `off`.
- All operations are non-blocking from the print path. `claimSerial` returns the cloud verdict; on 409 duplicate it logs a warning (the local guard already let the bottle through).
- Exposes `useCloudLedger` for React subscribers via `useSyncExternalStore` (cached snapshot, same pattern as `faultGuard`).

## Catalog integration
- `catalog.recordPrinted` and `recordMissed` fire cloud claims after the local write.
- `catalog.preSeedPrinted(serials)` lets the resume flow mark serials as already-printed and auto-advance `nextIndex` past them.
- `catalog.setActiveRunId` correlates ledger entries to their run.

## Production run integration
- `productionRun.start` registers the run in the cloud and stores the returned id on `meta.cloudRunId`.
- `productionRun.stop` and `cancel` push final counts.
- The cloud run id is mirrored to localStorage so a refresh during an active run keeps the linkage.

## UI
- **OperatorHUD**: a `Cloud`/`CloudOff` badge in the top status bar shows live sync state, in-flight counter, and last-OK timestamp.
- **StartRunDialog**: when the cloud reports active runs on the loaded catalog (e.g. another PC died mid-shift), a "Resume from cloud" panel appears with one button per run. Clicking it pre-seeds the local printedSet from the cloud's printed-serials query, then starts a fresh run carrying the same lot number.

## Failure modes
- Cloud unreachable → `best-effort` mode: prints proceed, badge turns red, claims will catch up next request.
- Same serial claimed by two PCs simultaneously → DB unique index rejects the second claim with 23505; client logs a warning. The bottle has already physically printed on both PCs (rare race), but operators are alerted.
- Run abandoned (PC powered off) → row stays in `active` status, surfaces in StartRunDialog's "Resume from cloud" list.
