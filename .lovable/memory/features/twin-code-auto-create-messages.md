---
name: Twin Code auto-create messages on bind
description: TwinCode bind now seeds canonical LID (DM 16×16) and SIDE (Standard 7×5 text) messages on the printer if missing — operator no longer has to build them on the HMI before first run. Per-side opt-out checkbox in TwinPairBindDialog.
type: feature
---

# Twin Code — Auto-Create Messages on Bind

## What changed
The dispatcher's bind flow now guarantees the configured LID/SIDE messages
exist on the printer with the right field shape **before** ^SM selects them.
Removes the manual "build the message on the printer HMI" step that was the
top failure mode for first-time hardware bring-up.

## Wire sequence on bind (per side)
```
^MB → ^LM → if message missing: ^DM <name> → ^NM ... → ^SV → ^SM <name>
```
Existing messages are **never overwritten** — the dispatcher only seeds when
^LM does not return the configured name. Idempotent on every subsequent bind.

## The seeds (`src/twin-code/messageSeeds.ts`)

### LID_SEED (A side)
```
^DM __NAME__
^NM 16;0;0;0;__NAME__^AB 20;0;7;5;DRYRUN0000000
^SV
```
- Template = 16-dot strip (Model 88 capable; caps height for ≥200 units/min)
- Single field 1: native ECC200 DataMatrix, size param `s=5` → 16×16
- Centered (x=20 for typical 60-dot pad), bottom-anchored (y=0)
- Dispatcher overwrites data per print via `^MD^BD1;<serial>` — bitmap upload
  NOT used (matches `mem://integration/datamatrix-bd-vs-ng`)

### SIDE_SEED (B side)
```
^DM __NAME__
^NM 16;0;0;0;__NAME__^AT 0;0;1;DRYRUN0000000
^SV
```
- Template = 16-dot strip (parity with LID)
- Single field 1: text, font `1` = Standard 7×5
- Left-aligned (x=0), bottom-anchored (y=0)
- Sized for 13 chars (~78 dots wide at 5-wide font)
- Dispatcher overwrites data per print via `^MD^TD1;<serial>`

`__NAME__` is replaced at send time with the operator-configured message name
so renamed pairs (e.g. "LID-A1") still get the correct ^DM target.

## API surface

`twinPairStore.TwinPrinterBinding` gained:
```ts
autoCreate?: boolean; // per-side, defaults true for v3+ entries
```

`twinDispatcher.TwinDispatcherOptions` gained:
```ts
autoCreateA?: boolean;
autoCreateB?: boolean;
```

`PrinterSession.enter()` signature changed from `(messageName?: string)` to
`(opts: { messageName?: string; seed?: MessageSeed })` so the seed travels
through the existing entry flow without a side channel.

`BoundPairResult` gained `seededA?: boolean` and `seededB?: boolean` so the
LIVE toast can tell the operator when seeding actually fired.

## UI
`TwinPairBindDialog` shows a per-side checkbox ("Auto-create on bind if
missing") with the seed description inline. Default ON. Operator can opt out
per side when they want to run a hand-built message instead.

The dialog footer documents the full wire sequence including the ^LM check
and conditional ^DM/^NM/^SV path.

## Files
- `src/twin-code/messageSeeds.ts` — new, canonical LID/SIDE seeds + helpers
- `src/twin-code/twinPairStore.ts` — `autoCreate` field on binding (default true)
- `src/twin-code/twinDispatcher.ts` — `ensureMessage` helper, `enter()` opts shape, seededA/B in result
- `src/twin-code/components/TwinPairBindDialog.tsx` — per-side checkbox + footer copy
- `src/twin-code/components/ConveyorPanel.tsx` — passes autoCreateA/B from store, surfaces seed in toast

## Why seed-and-skip (not always-overwrite)
Operator-built tweaks (font choice, position adjustments, extra static text
labels) are valuable; the dispatcher only needs the field shape to be correct
at the configured index. Always-overwrite would clobber operator work and add
~2-4s to every bind. The ^LF field-index sanity check still runs after entry
and will refuse to bind if the operator's hand-edited message no longer has
the right field type at the configured index — so a misconfigured manual
message fails LOUD, not silent.
