---
name: ^NM → ^SV digest pause (size-scaled)
description: Pause between ^NM and ^SV must scale with field count. 300 ms base + 60 ms/field, cap 3 s. Fixes Dozen12 (12-field) lockup without violating frozen v0.1.166 baseline.
type: feature
---

# ^NM → ^SV digest pause

## Rule
Between `^NM` and the following `^SV` in `saveMessageContent` (usePrinterConnection.ts):

```
delay = min(3000, 300 + validFields.length * 60)  // ms
```

All other inter-command delays stay at 300 ms (or 800 ms after the switch-away `^SM`).

## Why
Observed on real hardware: messages with ≤10 fields save fine at 300 ms.
At 12 fields (Dozen12) the firmware is still parsing/persisting the long `^NM`
payload when `^SV` arrives, and the printer wedges (jet stays on, HMI stops
responding). Scaling only this one transition gives the firmware enough
headroom without slowing small saves.

## What this fix is NOT
This is **not** a re-introduction of any forbidden guard from
mem://features/message-persistence/dozen12-validation:
- No `writeLockRef` / `waitForWriteLockToClear`
- No `waitForPollingIdle` around save
- No `getWriteTimingProfile` / scaled timeouts on `selectMessage`
- No `settleBeforeSelectMs` / `settleAfterSelectMs` in MessagesScreen

It is a **single per-command delay** that only fires when the command we
just sent starts with `^NM `. The save → select handoff stays untouched.

## Validation
- 1–10 field messages: no observable regression (extra 60–600 ms is invisible)
- 12-field prompt message (Dozen12): saves and selects without lockup
- Cap of 3 s protects against pathological 50+ field messages
