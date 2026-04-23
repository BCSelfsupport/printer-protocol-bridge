---
name: Twin Code Production Run + Audit Export
description: Lot-locked production runs with operator name, pre-flight gates, live counters, and tamper-evident CSV/JSON audit export
type: feature
---

# Twin Code — Production Run + Audit Export

Wraps a bonded twin printer session into a named, auditable batch suitable
for METRC / FDA-style compliance evidence. Lives as a single horizontal
bar above the HUD (and Debug) content on `/twin-code`, visible in both
view modes.

## Lifecycle

1. **Idle**: A dashed "No active production run" strip with a Start button.
2. **Start dialog (`StartRunDialog`)** asks for:
   - Lot # / batch ID (auto-suggested as `LOT-YYYYMMDD-HHMM`)
   - Operator name (remembered across runs in `twincode.run.lastOperator`)
   - Optional note
   - Pre-flight gates: catalog has remaining serials (REQUIRED), twin
     pair bound (optional), LIVE engaged (optional — captured into the
     run metadata so the audit shows synth vs real).
3. **Active**: Solid primary-bordered bar with lot, operator, live
   elapsed clock, printed/missed/yield counters, and a destructive
   "Stop & export" button (with confirm dialog).
4. **Completed**: Green/amber/red banner (tone by yield) with quick
   CSV / "Signed JSON" download buttons + "New run" + dismiss.

## Audit data model

Single source of truth — the **catalog** already records every printed/
missed bottle with `wallAt` (epoch ms) + `bottleIndex`. ProductionRun
stores `recordsStartIdx` at Start and slices `[start, end)` from
`catalog.getRecords()` at Stop. **Zero duplication, zero new wiring in
the dispatcher or sim.**

## Tamper-evidence

On Stop the export computes:
- `recordsHash` = SHA-256 over `JSON.stringify(records)`
- `documentHash` = SHA-256 over `JSON.stringify({ meta, summary, recordsHash })`

Both hashes are embedded in the JSON export; the document hash is shown
as a 12-char prefix on the completed-run banner. Any later edit to the
records array invalidates `recordsHash`, which invalidates `documentHash`.

WebCrypto (`crypto.subtle.digest`) does the work — available in all
modern browsers and Electron.

## Files

| File | Role |
|------|------|
| `src/twin-code/productionRun.ts` | Singleton store + SHA-256 helpers + CSV/JSON download helpers |
| `src/twin-code/useProductionRun.ts` | React hooks (`useProductionRun`, `useLiveRunSummary`) |
| `src/twin-code/components/StartRunDialog.tsx` | Pre-flight-gated start dialog |
| `src/twin-code/components/ProductionRunBar.tsx` | Idle / Active / Completed bar |
| `src/pages/TwinCodePage.tsx` | Renders `ProductionRunBar` above HUD + Debug content |

## Persistence

The active run's metadata (lot, operator, recordsStartIdx, etc.) is mirrored
to `localStorage["twincode.activeRun.v1"]` so a refresh mid-run does not
lose the batch boundary. Completed runs are kept in-memory only — the
download IS the durable artifact.

## Companion memory

- `mem://features/twin-code-catalog-persistence` — the ledger this slices
- `mem://features/twin-code-operator-hud` — the HUD this bar lives above
- `mem://features/twin-code-live-dispatcher` — the bonded ^MD path the records describe
