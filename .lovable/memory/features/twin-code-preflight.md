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
