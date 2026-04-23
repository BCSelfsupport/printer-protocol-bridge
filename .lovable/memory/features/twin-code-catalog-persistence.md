---
name: Twin Code Catalog Persistence
description: localStorage-backed ledger that survives refresh/restart, fingerprints CSVs for resume, and enforces never-print-the-same-serial-twice
type: feature
---

# Twin Code — Catalog Persistence & Restart Safety (Phase 2)

Customer rule (locked SOW): **never print the same serial twice — ever.**
Phase 2 makes that guarantee survive page refreshes, Electron crashes, and
accidental navigations.

## Storage shape

`localStorage` key: `twincode.catalog.v1`

```ts
interface PersistedShape {
  v: 1;
  entries: { rowIndex: number; serial: string }[];
  nextIndex: number;
  consumedCount: number;
  missCount: number;
  printedSerials: string[];   // rebuilds the in-memory anti-dup Set on resume
  records: LedgerRecord[];    // full audit trail (printed + missed, with wallAt)
  fingerprint: string;        // FNV-1a 32-bit over count + serials
  savedAt: number;            // wall-clock epoch ms
}
```

## Write strategy

- 250ms debounce — every state mutation (`dispense`, `recordPrinted`,
  `recordMissed`, `reset`) schedules a save, batching bursts.
- `pagehide` + `beforeunload` listeners flush the pending save synchronously
  so an in-flight debounce can't lose the last few records.
- Quota errors are swallowed with a console warn; the next save retries.

## Fingerprint

Stable hash of `count + serials`, FNV-1a 32-bit, hex. On `catalog.load(serials)`
we compute the new fingerprint and report whether it matches the persisted
session — the UI surfaces this as "Same catalog detected — resume?".

## Anti-duplicate guards (two layers)

1. **`dispense()`** is sequential (`nextIndex++`). It also screens against
   `printedSet` — if a CSV contains internal duplicates, the duplicate row is
   skipped with a console warn rather than emitted.
2. **`recordPrinted(serial)`** throws `DuplicateSerialError` if the serial is
   already in the in-memory `Set<string>`. The conveyor sim and live
   dispatcher both catch this, log loudly, and convert the bottle to a
   miss-print. Net effect: even a buggy external dispatcher cannot get a
   duplicate into the audit trail.

## Resume / Discard UX

`LedgerResumeBanner` (in `ConveyorPanel`) shows when:
- Cold boot: a persisted ledger exists but no catalog is loaded.
- Re-import: a freshly loaded catalog's fingerprint matches the persisted one
  AND no new records have been written yet.

Two actions:
- **Resume** — `catalog.resumePersisted()` rehydrates entries, nextIndex,
  printedSet, records, fingerprint. The banner self-dismisses.
- **Discard** — wipes localStorage and dismisses. Used when starting a fresh
  shift / rejected lot.

## What's NOT persisted

- `BottleSample[]` profiler samples (in `profilerBus`) — these are runtime
  perf telemetry, not compliance data. Use Export CSV/JSON if you need them.
- LIVE bind state — `twinDispatcher` always boots un-bound; LIVE has to be
  re-engaged after a restart (intentional safety: the operator must
  consciously reconnect to the printers).

## Files

| File | Role |
|------|------|
| `src/twin-code/catalog.ts` | Singleton ledger; persistence, fingerprint, guards |
| `src/twin-code/components/LedgerResumeBanner.tsx` | Resume/Discard UI |
| `src/twin-code/conveyorSim.ts` | Wraps `recordPrinted` in try/catch for the dup guard |
| `src/twin-code/components/ConveyorPanel.tsx` | Mounts banner, surfaces fp + last-saved chip |

## Companion memory

- `mem://features/twin-code-live-dispatcher` — bonded ^MD wiring
- `mem://features/twin-code-serial-format` — 13-char [A-Z0-9] format
- `mem://features/twin-print-pair-sow` — overall SOW
