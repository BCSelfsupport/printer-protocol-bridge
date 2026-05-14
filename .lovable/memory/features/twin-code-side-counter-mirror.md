---
name: Twin-Code SIDE → LID counter mirror
description: When operator changes the SIDE printer's auto-code counter slot via the printer-preview Counters card, twinDispatcher.notifySideCounterChanged mirrors the matching next serial to the LID via ^MD^BD so the lid's 2D barcode tracks the SIDE 1:1 instead of drifting to the previous host-computed value.
type: feature
---

# SIDE → LID counter mirror (auto-code)

The LID prints a host-driven DataMatrix (^MD^BD); the SIDE self-prints from
its native ^AC counter. When the operator loads / resets the SIDE counter
from the printer-preview screen, the LID's queued serial would otherwise
stay at whatever value the host last pushed (often 000001 from bind), so
SIDE prints 000003 while LID prints 000001.

## ^CC firmware semantics (corrected)

`^CC slot;V` loads V as the value the printer will PRINT on the very next
photocell trip — there is **no pre-increment**. The printer increments
*after* the print, so the next ^CN reads V+1.

- Bind seed: `^CC slot;${start}` (NOT `start - 1`)
- Production-run reset: same — seed `${start}` directly
- Photocell mirror baseline: ^CN value n IS the next-to-print → preload LID with `n` (NOT `n+1`)
- After delta D between polls: SIDE printed `mirrorLast..n-1`, will print `n` next

We previously assumed increment-then-print and seeded `start - 1`. Operators
saw SIDE physically print 000008 while HUD/LID showed 000009 — exactly one
behind. Switching to direct seed restored 1:1 parity.

## Wiring
- `twinDispatcher.notifySideCounterChanged(printerId, slot, currentValue)`
  - No-op unless bound + autoCodeMode + printerId === this.b.printerId +
    slot === autoCodeOpts.counterSlot.
  - `next = currentValue` (printer will print this value next).
  - Re-aligns `autoCodeSerialMirror` and re-baselines mirror state.
  - Calls `preloadAutoCodeLid(currentValue, ...)` → `^MD^BD<field>;<serial>`.
- `usePrinterConnection.resetCounter` calls it after every successful `^CC`.
- `twinDispatcher.resetProductionRunCounters()` is invoked by
  `productionRun.start()` so every new lot zeroes Print Count + Product
  Count on BOTH printers AND re-seeds the auto-code slot to `start`,
  immediately preloading the LID barcode to match.
