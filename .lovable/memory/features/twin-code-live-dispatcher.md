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

## Field mapping

Default: both printers receive `^MD^TD2;<serial>` (field index 2). Configurable per printer
via `TwinDispatcherOptions.fieldA` / `fieldB`. The customer's typical bonded pair:
- A = lid printer, 16×16 Data Matrix, field index TBD per message
- B = side printer, 13-digit human-readable text, field index TBD per message

If A and B use different field indices in their messages, set `fieldA` / `fieldB` on bind.

## UI behavior

- LIVE toggle is **disabled** while the conveyor is running — preventing mid-run mode swap
- LIVE toggle is **disabled** until a twin pair is bound
- Toast on success / failure with printer IDs for traceability
- Auto-unbinds on `ConveyorPanel` unmount (e.g. nav away from Twin Code page)

## What's still synthetic in LIVE mode

`ingressMs` (catalog dispense) and `dispatchMs` (in-process work) are still small synthetic
values in LIVE mode — they're sub-millisecond on real hardware anyway. The wire timings
(`wireAMs`, `wireBMs`) come from real R-to-C measurements.
