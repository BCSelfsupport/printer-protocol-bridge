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

## Wiring
- `twinDispatcher.notifySideCounterChanged(printerId, slot, currentValue)`
  - No-op unless bound + autoCodeMode + printerId === this.b.printerId +
    slot === autoCodeOpts.counterSlot.
  - Re-aligns `autoCodeSerialMirror` (`resetForNext(currentValue + 1)`).
  - Re-baselines the photocell mirror (mirrorBaseline/mirrorLast = currentValue)
    so the next `^CN` poll doesn't fire mirror-rezero or mirror-advance.
  - Calls `preloadAutoCodeLid(currentValue + 1, ...)` → `^MD^BD<field>;<serial>`.
- `usePrinterConnection.resetCounter` calls it after every successful `^CC`
  on the active printer (Counters card / Reset All / Load Count). Failure is
  swallowed (best-effort mirror).

## Why "currentValue + 1"
BestCode firmware is increment-then-print: after `^CC slot;V`, the slot
holds V and the very next photocell trip prints V+1. The LID must encode
V+1 too — same convention as `autoCodeSerial.next()` and the bind-time
`resolveNextAutoCodeCounterFromSide` flow.
