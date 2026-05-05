---
name: Fleet telemetry must defer during printer save
description: Concurrent Fleet HTTP pushes during the ^NM digest window locked up F8/F9 saves. saveMessageContent now wraps the save in beginSaveBusy() and useFleetTelemetryPush bails when isSaveBusy() is true (plus a 4s grace).
type: feature
---

## Symptom
With 8+ field messages, save completes on the printer HMI but the app spinner
hangs and the next ^NM/^NF times out. Disabling Fleet telemetry made the same
9-field save complete reliably.

## Root cause
useFleetTelemetryPush fires `register-printer` and `push-telemetry` HTTPs on a
30s/5min cadence. When one of those landed mid-save (during the per-field 60ms
digest pause window), the renderer competed with the TCP socket commit and the
firmware dropped the next command.

## Fix
- New `src/lib/saveBusy.ts` — `beginSaveBusy()` returns release fn, `isSaveBusy()`
  reports true while count>0 OR within a 4s grace after release.
- `saveMessageContent` (usePrinterConnection.ts) calls `beginSaveBusy()` next to
  `setPollingPaused(true)` and releases at every existing resume site.
- `useFleetTelemetryPush` checks `isSaveBusy()` at the top of both `registerAll`
  and `pushTelemetry` and returns without firing.

Independent of the manual Dev Panel telemetry pause (`telemetryPause.ts`), which
remains for diagnostic isolation.
