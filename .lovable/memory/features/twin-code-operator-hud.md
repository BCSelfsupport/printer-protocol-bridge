---
name: Twin Code Operator HUD
description: Shift-floor display mode with big BPM gauge, A/B status lights, last printed serial readable from 6ft, audible miss-print alarm
type: feature
---

# Twin Code — Operator HUD

A view-mode toggle on `/twin-code` that swaps the dense profiler dashboard for
a glanceable shift-floor HUD. Designed to be readable at ~6 feet so an
operator can monitor a bonded twin printer line without standing at the
keyboard.

## What's on screen

| Region | Content | Why |
|--------|---------|-----|
| Top status bar | Single overall state: "Production · all systems nominal" / "Synthetic mode" / "Twin pair not bound" / "Miss-prints detected" / "Catalog exhausted" | One line tells the operator if anything needs attention |
| BPM gauge | 7xl tabular-num bottles/min + m/min sub-line | The single most important throughput number |
| Twin printer lights | A·LID + B·SIDE cards with pulsing dot when LIVE & printing, plus LIVE/SYNTH mode tile and yield % tile | Status lights, not paragraphs |
| Last printed serial | 3xl-4xl mono, with cycle ms + skew ms above | Confirms the line is producing what it should |
| Batch progress strip | printed / missed / remaining + percentage bar | Run-aware ("we're 47% through the lot") |

## Audible alarm

`src/twin-code/audioAlarm.ts` — zero-asset WebAudio beep. Two-tone (660Hz →
440Hz, 110+160ms) on every new miss-print. Toggled via the speaker icon in
the HUD top bar; preference persisted to `localStorage` key
`twincode.hud.alarmEnabled`. Default ON.

WebAudio context is lazily created on first user gesture and reused. If the
context is suspended (browser autoplay policy), the alarm call calls
`ctx.resume()` first.

## View toggle

Header pill toggle in `TwinCodePage` switches between:
- **HUD** — `OperatorHUD` + `ConveyorPanel` (the conveyor stays visible
  because it owns Bind / LIVE / Start / Reset controls).
- **Debug** — the original profiler harness (bottleneck callout, throughput
  gauge, generator sliders, waterfall, histograms, heatmaps).

Preference persisted to `localStorage` key `twincode.view`. Default = `hud`.

## Status logic

`computeOverallStatus` derives the top banner colour:
- 🔴 `bad` — recent miss-prints AND yield < 98%
- 🟡 `warn` — no catalog / no pair / catalog exhausted / synthetic mode
- 🟢 `ok` — bound, LIVE, catalog has rows, no miss alarm

The whole HUD frame `animate-pulse`s with a destructive border for 1.2s
after every new miss-print, regardless of alarm sound preference — visual
alert is always on.

## Files

| File | Role |
|------|------|
| `src/twin-code/components/OperatorHUD.tsx` | The HUD itself |
| `src/twin-code/audioAlarm.ts` | WebAudio beep + missAlarm helpers |
| `src/pages/TwinCodePage.tsx` | View toggle + conditional rendering |

## Companion memory

- `mem://features/twin-code-live-dispatcher` — bonded ^MD wiring
- `mem://features/twin-code-catalog-persistence` — ledger + anti-dup
- `mem://features/twin-code-serial-format` — 13-char format
