---
name: twin-code-preflight
description: Dry-run/pre-flight test fires N ghost cycles through bonded path or synthetic model, surfaces green/red ready-for-production verdict
type: feature
---

# Twin Code — Pre-flight (Dry-Run) Test

## Purpose
Before locking a real batch via Production Run, the operator can fire 5–20
"ghost" cycles through the bonded twin pair (or a synthetic stand-in) to
verify cycle latency, A↔B skew, ACK loss, and consecutive-failure streaks.

## Modes
- **LIVE**: when `twinDispatcher.isBound()`, each ghost cycle calls
  `twinDispatcher.dispatch()` with a `PREFLIGHT-…` test serial. Real wire
  ACKs are timed.
- **SYNTHETIC**: when no pair is bound, a Box–Muller jitter model fabricates
  per-side wire RTTs (defaults: A=8ms, B=6ms, jitter=0.25) so the test can
  still run on developer machines with no hardware.

## Isolation
The test **does not** consume catalog serials, **does not** write to the
production-run ledger, and **does not** push to the profilerBus. Catalog and
ledger remain untouched so pre-flight can be run repeatedly without polluting
production data.

## Force trigger behavior
LIVE pre-flight must dispatch with `forceTrigger: true`. After both printers
accept the next code and report `R`, the dispatcher sends raw `^PT` Print Go /
Force Print over the existing 1-1 socket on both printers. This is the same
manual print signal the operator would otherwise press, and it must happen once
per pre-flight/dry-run cycle so the test advances to the next code.

## Bench production simulation
With LIVE mode active, Bench trigger can pace real printer dispatches from the
conveyor BPM model. It uses the same forced `^PT` Print Go path after each
accepted serial, allowing office testing into a beaker while increasing BPM
until faults or missed cycles appear.

## Future comparison tests
After wired CSV/BPM timing is validated, add network-condition comparison tests
for hard cable vs Wi-Fi. Use the same real CSV, print-count selector, BPM ramp,
and automatic `^PT` trigger path so min/max cycle time, jitter, misses, and max
stable BPM can be compared apples-to-apples across connection types.

## Pass thresholds (defaults)
- Success rate ≥ 95%
- Cycle p95 ≤ 80 ms (LIVE) / 50 ms (SYNTH)
- Skew p95 ≤ 20 ms
- Worst consecutive-failure streak ≤ 2

All four must pass for a green verdict.

## Entry points
- `ProductionRunBar` (idle state): "Pre-flight" button next to "Start production run"
- `StartRunDialog`: "Run dry-run test" button in the pre-flight checks header

## Files
- `src/twin-code/preflight.ts` — runner, verdict, percentile stats
- `src/twin-code/components/PreflightDialog.tsx` — UI with progress, per-cycle table, verdict card
