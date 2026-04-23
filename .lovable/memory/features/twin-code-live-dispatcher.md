---
name: Twin Code Live Bonded Dispatcher
description: How the conveyor simulator's photocell event drives real bonded ^MD writes via 1-1 mode on both A and B printers
type: feature
---

# Twin Code — Live Bonded Dispatcher

Bridges the synthetic conveyor sim to the real 1-to-1 print path. Companion to:
- `mem://integration/protocol-v2-6-one-to-one-mode` (protocol spec)
- `mem://architecture/one-to-one-mode-implementation` (single-printer wiring)

## Architecture

```
Photocell fires (sim)
      ↓
conveyorSim.firePhotocell(bottle)
      ↓
liveDispatcher(serial)            ← pluggable; null = synthetic mode
      ↓
twinDispatcher.dispatch(serial)
      ↓ (parallel)
PrinterSession A.sendMD ── ^MD^TD2;<serial> ──→ Printer A → R/T/C
PrinterSession B.sendMD ── ^MD^TD2;<serial> ──→ Printer B → R/T/C
      ↓
Promise.all → resolves when BOTH report C
      ↓
profilerBus.push({serial, t0..t4, wireAMs, wireBMs, skewMs, cycleMs})
```

## Two-controller pattern

The original `oneToOneController` is a singleton — fine for single-printer flows.
For a true bonded pair we need TWO independent state machines (separate ACK streams,
separate in-flight queues, parallel ^MB/^ME). `src/lib/twinDispatcher.ts` defines a
`PrinterSession` class internally and instantiates one for A and one for B.

## Key files

| File | Role |
|------|------|
| `src/lib/twinDispatcher.ts` | `PrinterSession` × 2, `bind()` / `dispatch(serial)` / `unbind()` |
| `src/twin-code/conveyorSim.ts` | `setLiveDispatcher(fn \| null)` swaps wire latency from synthetic → real |
| `src/twin-code/components/ConveyorPanel.tsx` | LIVE/SYNTH toggle (Switch) |

## Lifecycle

1. **Bind**: User flips the LIVE switch (only enabled when twin pair is bound + sim is stopped)
   - `twinDispatcher.bind(pair, printers)` resolves IPs → printer IDs from `usePrinterStorage`
   - Pauses global polling once for the whole bonded session
   - Enters 1-1 on A and B in parallel via `Promise.all`
   - Plugs `conveyorSim.setLiveDispatcher((s) => twinDispatcher.dispatch(s))`
2. **Run**: Each photocell fires `dispatch(serial)`; the sim awaits real RTTs
3. **Unbind**: Toggle off → ^ME on both, restore polling, sim reverts to synthetic

## Pacing & safety

- Per-printer 4-message buffer cap (firmware limit per §6.1)
- 500ms R-timeout per ^MD (silent-drop detection)
- 30s C-timeout per print (PE-bound generous)
- **Fast-fail partner**: if A fails (timeout/JET STOP/DEF OFF), B's in-flight ^MD is
  aborted after a 50ms grace instead of waiting out the 30s C-timeout (and vice versa).
- **Field-index sanity check on bind**: ^LF is issued on both A and B after entry to
  confirm the configured `fieldA` / `fieldB` indices exist. Bind fails early with a
  clear per-side error if not. Skip via `opts.skipFieldCheck`.
- **Per-side reasons**: `TwinDispatchResult` now exposes `aReason` / `bReason`
  alongside the combined `reason` string (formatted as `A:<reason> / B:<reason>`).
- `JET STOP` drains in-flight as failed but does NOT auto-unbind (caller owns lifecycle)
- Polling is paused once for the entire bonded session and resumed on unbind, only if
  the dispatcher was the one to pause it (plays nicely with mobile-companion pause)

## Field mapping & subcommand selection

Each side picks its own ^MD subcommand independently (per protocol v2.6 §5.28):

| Side | Default subcommand | Default field | Frame example |
|------|--------------------|---------------|---------------|
| A (lid) | **`^BD`** (native barcode-data) | 2 | `^MD^BD2;1234567890123` |
| B (side) | **`^TD`** (text-data) | 2 | `^MD^TD2;1234567890123` |

A defaults to `^BD` because the customer's lid printer carries the 16x16 ECC200
DataMatrix — native `^BD` is sub-millisecond per print, vs ~5–50 ms for the
bwip-js → `^NG` bitmap-upload workaround. See
`mem://integration/datamatrix-bd-vs-ng` for the full rationale.

Override per pair via `TwinDispatcherOptions`:
- `fieldA` / `fieldB` — field indices (default 2 each)
- `subcommandA` / `subcommandB` — `'TD'` or `'BD'`

On bind, `verifyFieldIndex` parses `^LF` and rejects mismatches (e.g. trying
`^BD` against a text field, or `^TD` against a graphic). Type enforcement is
only applied when `^LF` actually surfaces a recognizable type token; if the
firmware response is index-only the type check is skipped (existence check
still runs). Skip both via `opts.skipFieldCheck`.

## UI behavior

- LIVE toggle is **disabled** while the conveyor is running — preventing mid-run mode swap
- LIVE toggle is **disabled** until a twin pair is bound
- Toast on success / failure with printer IDs for traceability
- Auto-unbinds on `ConveyorPanel` unmount (e.g. nav away from Twin Code page)
- **Pre-flight dry run** (`twinDispatcher.dryRun(n, seed)`) — fires N (≤50) sequential
  real dispatches before the conveyor is started. Seeds with the next un-consumed
  catalog serial via `catalog.peek()` (does NOT mutate state) so the printers
  produce real scannable codes. Returns aggregated `aStats` / `bStats` / `skewStats`
  / `cycleStats` and de-duplicated per-side failure reasons. Exposed in the
  Conveyor toolbar as a "Dry run ×5" button + result chip; only enabled while
  LIVE is engaged AND the conveyor is stopped.

## What's still synthetic in LIVE mode

`ingressMs` (catalog dispense) and `dispatchMs` (in-process work) are still small synthetic
values in LIVE mode — they're sub-millisecond on real hardware anyway. The wire timings
(`wireAMs`, `wireBMs`) come from real R-to-C measurements.

## Emulator-backed LIVE mode

When the bonded pair resolves to printers owned by the multi-printer dev emulator
(`multiPrinterEmulator.getInstanceById(id)` returns a session), `PrinterSession`
auto-detects this in `enter()` and switches to a fully in-process path:

- `^MB` / `^SM` / `^ME` are still issued through the regular transport so the
  emulator's `oneToOneMode` flag and `currentMessage` stay consistent.
- `^MD` is sent through the transport (emulator increments product counts and
  logs the command), then **R/T/C are synthesized in-process** with small
  per-printer jitter so A vs B skew is visible in the profiler.
- Field-index verification (`^LF`) is **skipped** for emulator pairs — the
  emulator's field model isn't a meaningful parity target.
- No Electron `oneToOne:ack` IPC is required, so the LIVE toggle works
  end-to-end in the dev emulator without real hardware.

This means a developer can: enable the multi-printer emulator → bind a twin pair
to two emulated printers → flip LIVE on the conveyor → watch the profiler fill
with realistic R/T/C cycle times and A/B skew.
