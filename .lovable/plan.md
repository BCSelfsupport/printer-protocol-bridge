# Width=15 Revert + Per-Message Delay Override

Two related issues on the same code path (message-adjust resolution).

## Part 1 — Why Width sometimes reverts to 15

### What we know
- Fleet default: Width=2, Delay=500, Speed=Ultra Fast.
- On every `^SM`, `applyStoredAdjustSettings` pushes `^PW / ^DA / ^SB / ^GP / ^PA` with `forcePushAllAdjust: true`.
- Resolution order for Width is currently: **Printer Setup Card override → Fleet default → Factory**. The stored per-message value is **never** used (Setup Card always wins because `getPrinterMessageDefaults` fills every key).

### Likely root causes (ranked)
1. **Setup Card override contains 15.** If a printer's `messageDefaults.width` was ever saved as 15 (or seeded from HMI), every select for that printer sends `^PW 15`. High-probability. We should surface / clear stale per-printer overrides.
2. **`captureHmiAdjustSilently` writes 15 back into a message.** Guard is `alreadyStored` — if the previous select stored width=2, and HMI later reports 15 (e.g. `^PW` push didn't take, or a slow-follow HMI edit), the stored copy becomes 15. Even though Setup Card should still win on next select, if a customer inspected the message in CodeSync they'd see 15 and lose trust.
3. **`^PW` not actually landing.** If `sendVerifiedCommandSequence` reports success but the printer rejected `^PW` (e.g. Jet Off, message locked), UI updates local settings anyway. Silent divergence.
4. **`^SV` still in the sequence** (line 1845) — harmless (transport short-circuits), but pointless timing noise.

### Diagnostic + fix plan
- Add a one-line log at the top of `applyStoredAdjustSettings` printing `{ setupCardOverrides, fleetDefaults, storedAdjust, resolvedFull }` so we can prove which layer produced Width for any given select.
- Verify `^PW` ACK: promote the existing sequence log to warn-level when the printer's response is not the expected `^PW ok`. Currently we only log `failed` on overall sequence failure — individual command replies are dropped.
- Add a "Reset to Fleet Defaults" affordance in the Setup Card's message-defaults section so a stale 15 saved there can be cleared in one click.
- Remove the dead `^SV` push from `applyStoredAdjustSettings` (keep the 300 ms flush by rewriting to a plain delay — no protocol traffic).

## Part 2 — Per-message Delay override

### Current behaviour
Setup Card wins for Width/Delay/Bold/Gap/Pitch/Speed for **every** message on that printer. There is no way to say "this specific message needs Delay=800". This is what the customer is asking for.

### Design
Change the resolution order to give explicit per-message values priority, without breaking the "printer wins for untuned messages" behaviour:

```text
Per-message stored value (only if explicitly set)
  → Printer Setup Card override
    → Fleet default
      → Factory
```

The pivot: `pick()` must distinguish "message has no opinion" from "message says 500". Today `stored[k]` gets skipped because `printerDefaults[k]` is always defined. We introduce `hasExplicitStored(k)` — true only when the operator set it in the Edit Message → Adjust panel (or Sync Adjust captured a deliberate HMI edit into an already-stored key).

Applies to **Delay, Width, Bold, Gap, Pitch** (all adjust keys). Speed and Rotation keep current behaviour (rotation always from printer; speed default from fleet/printer but overridable per-message the same way).

### UI change
In Edit Message → Adjust tab, each field gets a small "Use printer default" checkbox (or a clear "×" next to the number). Unchecked = inherit from Setup Card (current behaviour). Checked / value entered = explicit per-message override. Visually distinguish inherited vs overridden values (muted text vs bold).

### Storage
`adjustSettings` already supports partial values. We adopt the convention: **key present = explicit override, key absent = inherit**. Migration: existing messages that were auto-seeded with the full FLEET set need cleanup — we'll add a one-time migration on load that strips keys equal to the resolved printer default (so nothing appears "overridden" that wasn't intentionally set).

## Technical section

### Files to change
- `src/pages/Index.tsx`
  - `buildEffectiveMessageDependentSettings`: new `pick()` that honours explicit per-message values above printer defaults.
  - `applyStoredAdjustSettings`: add diagnostic log; drop `^SV` push; on success, do NOT overwrite stored message adjust with resolved full-set (only write keys we truly pushed as overrides).
  - `captureHmiAdjustSilently`: keep `alreadyStored` guard; also skip when the HMI value equals the resolved printer-card default (avoids "capturing" what was already inherited).
- `src/lib/fleetDefaults.ts`: no logic change; export a helper `isExplicitMessageOverride(details, key, printer)` for the UI.
- `src/components/screens/EditMessageScreen.tsx` (Adjust tab): per-field inherit/override toggle + inherited-value hint.
- `src/components/printers/EditPrinterDialog.tsx`: "Reset to Fleet Defaults" button in the message-defaults section.
- One-time migration in the messages store loader to strip auto-seeded full sets (keys equal to printer default) so existing messages don't appear overridden.

### Non-goals
- No protocol change. All existing `^PW / ^DA / ^SB / ^GP / ^PA` pushes remain.
- No change to rotation handling (still driven by Setup Card).
- No change to Speed default source, only the "explicit per-message override" gains a real code path.

### Test cases
1. New message, no overrides → select on Printer A (Setup Card W=2, D=500) → printer receives `^PW 2 ^DA 500`.
2. New message, per-message Delay override = 800 → select on Printer A → `^PW 2 ^DA 800`.
3. Same message → select on Printer B (Setup Card W=5, D=300) → `^PW 5 ^DA 800` (delay override travels, width inherits).
4. Legacy message previously auto-seeded with W=15 → migration strips it → next select uses Setup Card W=2.
5. Setup Card has stale `messageDefaults.width = 15` → new "Reset to Fleet Defaults" clears it → next select uses fleet W=2.

Approve and I'll implement.
