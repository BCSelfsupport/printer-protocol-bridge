---
name: twin-code-fault-recovery
description: Fault guard auto-pauses conveyor on JET STOP, disconnect, partner-loop, miss-streak, or high miss-rate; surfaces resume-from-bottle-N banner
type: feature
---

# Twin Code — Fault Recovery & Reconnect

## Purpose
Real production hits real-world faults: jet stops, network blips, cables get bumped. The fault guard sits between the bonded dispatcher and the conveyor as a policy layer that auto-pauses the line and gives the operator a one-click "Resume from bottle N" experience.

## Detection categories
- **jet-stop** — `JET STOP` / `JNR` text in dispatch reason
- **disconnect** — transport timeouts, send-failed, socket errors (ECONNRESET, EHOSTUNREACH, etc.)
- **partner-loop** — repeated `partner-failed` cascades (one side keeps dragging the other down). Trips after `partnerLoopLimit` (default 4)
- **miss-streak** — N consecutive failed dispatches. Default `missStreakLimit: 3`
- **high-miss-rate** — sliding-window miss-rate over last `windowSize` (default 20) bottles exceeds `windowMissRateLimit` (default 25%), with `windowMinSamples` (default 8) before the check is meaningful

All thresholds live in `DEFAULT_FAULT_GUARD_CONFIG` and are reconfigurable via `faultGuard.configure()`.

## Auto-pause behavior
When `cfg.autoPause` is true (default), the conveyor is stopped immediately on trip. The catalog's anti-duplicate guard (`printedSet`) ensures that even if a fault is acknowledged spuriously, no already-printed serial can be re-issued — `recordPrinted` throws `DuplicateSerialError`.

## Banner UI (`FaultRecoveryBanner`)
Renders directly inside `ConveyorPanel` above the conveyor view. When active:
- Plain-English code + side (A/B/both/unknown)
- "Resume from bottle #N+1" — calls `faultGuard.acknowledge()` and restarts conveyor
- "Acknowledge (stay paused)" — clears fault, leaves conveyor stopped
- History popover with last 25 incidents (CODE_LABEL + reasons)

When NOT active but recent history exists, a passive chip surfaces the count.

## Run lifecycle integration
`productionRun.start()` calls `faultGuard.reset()` so each new lot starts with clean state.

## Synthetic test path
"Test fault" button in the conveyor toolbar calls `faultGuard.trip()` directly so the recovery flow can be exercised without printers or LIVE mode.

## Files
- `src/twin-code/faultGuard.ts` — singleton, detection logic, snapshot
- `src/twin-code/useFaultGuard.ts` — useSyncExternalStore hook
- `src/twin-code/components/FaultRecoveryBanner.tsx` — UI
- `src/twin-code/conveyorSim.ts` — wires `observeDispatch()` into LIVE path
- `src/twin-code/productionRun.ts` — resets guard on `start()`
