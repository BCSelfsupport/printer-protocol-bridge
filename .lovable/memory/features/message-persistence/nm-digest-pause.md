---
name: ^NM digest pause + saveEditedMessage settle stripping
description: There is no ^SV command. The ONLY size-scaled delay in the save flow is the post-^NM digest pause inside saveMessageContent. saveEditedMessage in Index.tsx must NOT scale settle/reload by field count and must NOT call waitForPollingIdle around the save handoff. Heavy messages (≥6 fields) and extended-date messages skip the post-save ^GM/^LF reload entirely.
type: feature
---

# ^NM digest pause + post-save settle policy

## The only legitimate size-scaled delay
Inside `saveMessageContent` (usePrinterConnection.ts), after `^NM` returns while the printer digests the message:

```
delay = min(3000, 300 + validFields.length * 60)  // ms
```

All other inter-command delays in that function stay at 300 ms (or 800 ms after
the switch-away `^SM`).

## What saveEditedMessage in Index.tsx MUST NOT do
Per mem://features/message-persistence/dozen12-validation (frozen baseline):

- ❌ NO `followUpSettleMs` / `reloadSettleMs` scaled by `fieldCount`
- ❌ NO `await new Promise(r => setTimeout(r, 500))` before the post-save reload
- ❌ NO `await waitForPollingIdle(3000)` around the settings sequence or reload
- ❌ NO `settleBeforeSelectMs` / `settleAfterSelectMs` in MessagesScreen

These were re-introduced after v0.1.166 and caused the **exact symptom** the user
reported: "the printer HMI shows the save completed, but the Codesync spinner
keeps spinning, and eventually the printer locks up." That spinner = us still
holding `setPollingPaused(true)` while sleeping/idle-waiting; the lockup =
`^GM`/`^LF`/`^SM` re-entering the firmware mid-grace.

## Current rules (post-fix)
- `followUpSettleMs = MESSAGE_RELOAD_SETTLE_MS` (constant, NOT scaled)
- `reloadSettleMs   = MESSAGE_RELOAD_SETTLE_MS` (constant, NOT scaled)
- Settings sequence runs immediately after `^NM` ack and its digest pause — no pre-sleep, no
  `waitForPollingIdle`. The ^NM digest pause already covered firmware headroom.
- Post-save reload (`^GM`/`^LF`) is SKIPPED for messages with `fields.length >= 6`
  or any extended-date field. The local merged copy is authoritative.
- Heavy messages still get the right behaviour because:
  1. saveMessageContent's per-^NM pause scales 300 + 60ms × fieldCount
  2. We don't re-enter with reads/writes while the firmware is committing

## Validation
- 1–5 field messages: full save + reload, completes in <2s
- 6–11 field messages: save + skip reload, completes when ^NM acks and digest pause finishes
- 12-field prompt message (Dozen12): saves and selects without lockup, spinner
  releases as soon as ^NM ack and digest pause finish
