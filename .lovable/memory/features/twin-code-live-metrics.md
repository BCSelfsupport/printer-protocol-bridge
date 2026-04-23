---
name: Twin Code Live Production Metrics
description: Real BPM + line speed derived from actual ^MD dispatches; pitch + bottle Ø are operator-editable inputs that drive line-speed math
type: feature
---

# Twin Code — Live Production Metrics

The Operator HUD shows two visually similar but **conceptually different**
data streams. Confusing them is the #1 mistake when reading this code:

| Source | What it represents | Where it lives |
|--------|--------------------|----------------|
| `useConveyor()` | The **simulator**'s synthetic conveyor (driven by the Debug-view sliders for Line speed / Pitch / Wire A & B mean). Useful for testing without hardware. | `src/twin-code/conveyorSim.ts` |
| `useLiveMetrics()` | **Real production**: BPM is a count of `outcome === "printed"` samples on `profilerBus` over the last 60s. Each successful bonded `^MD` dispatch is one bottle. | `src/twin-code/liveMetrics.ts` |

## Math

- **BPM (rolling)** = `printed dispatches in last min(60s, elapsed) ÷ window × 60_000`.
  Window grows from start time to a max of 60s so the gauge isn't
  artificially low in the first minute.
- **Line speed (mm/s)** = `bpm × pitchMm ÷ 60`.
- **Gap (mm)** = `max(0, pitchMm − bottleDiameterMm)`.
- Display formatters convert mm/s → m/min or ft/min based on the HUD's
  m/ft toggle (`twincode.hud.units` localStorage key).

## Inputs (operator-editable, persisted)

| Field | Default | Bounds | Storage key |
|-------|---------|--------|-------------|
| `pitchMm` | 80 | 1–1000 | `twincode.liveMetrics.v1` |
| `bottleDiameterMm` | 60 | 1–1000 | `twincode.liveMetrics.v1` |

Edited via pencil icons in the **Production Metrics Card** below the HUD.
Same JSON blob holds both values.

## HUD wiring

The big BPM gauge in `OperatorHUD` follows source priority:

```ts
Math.round(live.hasLiveData ? live.bpm : conv.bpm)
```

So the gauge shows **real** dispatches when the line is producing, and
falls back to the synthetic conveyor BPM only when `liveMetrics` has zero
samples in its window (i.e. before the first real print). A small
"live · last 60s" / "synthetic preview" subscript under the gauge tells
the operator which source they're reading.

The line-speed sub-line follows the same priority.

## Lifecycle

- `liveMetrics` subscribes to `profilerBus` once on construction. Every
  push (printed OR missed) is checked against `lastSeenIndex` so each
  bottle is counted exactly once.
- `productionRun.start()` calls `liveMetrics.resetWindow()` so the gauge
  reflects the new lot only.
- A 1-second `setInterval` re-notifies subscribers so the rolling window
  decays naturally even when no new dispatches arrive (e.g. line stopped).

## Files

| File | Role |
|------|------|
| `src/twin-code/liveMetrics.ts` | Store + rolling window + persistence |
| `src/twin-code/useLiveMetrics.ts` | React hook |
| `src/twin-code/components/ProductionMetricsCard.tsx` | Editable card (pitch / Ø / live readouts) |
| `src/twin-code/components/OperatorHUD.tsx` | Gauge fallback + card mounting |
| `src/twin-code/productionRun.ts` | Calls `resetWindow()` on Start |

## Companion memory

- `mem://features/twin-code-operator-hud` — HUD layout, alarm, view toggle
- `mem://features/twin-code-live-dispatcher` — where the `^MD` push originates
