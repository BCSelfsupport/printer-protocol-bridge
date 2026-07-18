# Per-Printer Message Settings — Implementation Plan

**Status:** SOW signed off by customer (Gary Zimmerman, Shady Lane Farm) — 18 Jul 2026
**Predecessor doc:** `.lovable/per-printer-message-settings-implementation.md` (superseded by this file)

---

## 1. Confirmed rules (from customer sign-off)

1. **Per-printer settings are authoritative.** Every printer keeps its own Width, Delay, Bold, Gap, and Speed for every message. The message name is shared; the tuned numbers are not.
2. **Copy to Printers never overwrites tuned numbers.** If the target printer already has its own copy of that message, its Width/Delay/Bold/Gap/Speed are preserved. Only the message *content* (fields, text, barcodes) is refreshed.
3. **First-time send seeds from the source printer.** When a message is brand-new to a target printer, the source printer's numbers are used as the starting point. The technician tunes once; from then on that printer remembers its own numbers forever.
4. **Rotation always comes from the Printer Setup Card** (Flip / Mirror Flip). The message never controls rotation.
5. **All text/content edits happen on the PC, not at the printer.** The HMI can adjust Delay, Width, Encoder etc. (and we sync those back per Sync Adjust), but message *text and fields* are PC-only.

## 2. New behaviour the customer described (Squid parity)

The customer's previous system ("Squid") had a workflow we should match:

- When editing a message, the screen showed **every printer that had ever received that message**, stacked as small blocks (one per lane).
- Hitting **Send** pre-selected every lane that had ever run this message. The operator could uncheck lanes they didn't want.
- Sending was ~20 s for the whole fleet (we're already at ~30 s — good).
- If a printer failed to connect, a dialog offered **Ignore** or **Try Again**.
- Per-lane overrides were possible from the PC: e.g. change Lane 2 and Lane 4 from a 45-day code to a 60-day code, send, and only those two lanes changed — even though the message name stayed "Dozens".

We already have most of the plumbing (`ApplyToPrintersDialog`, `ApplyExpiryToPrintersDialog`, per-printer message keys). This plan aligns the behaviour and the UI to the Squid model.

## 3. Customer's open question

> "Will we be able to select any of these messages from the print station and load them for just that printer?"

**Answer we will implement:** Yes. Selecting a message at the HMI is already a native printer function (`^SM` issued locally). Our software should:

- Detect the change on the next `^SU` / `^QM` poll,
- Update that printer's `currentMessage` in the UI,
- **Not** fan the selection out to any other printer,
- Leave that printer's stored per-printer settings untouched (they're already correct for that printer).

No code change required for the selection itself — the polling already picks it up. We will add a short **user-manual note** and verify the polling path doesn't accidentally re-push a different message.

---

## 4. Current baseline (what already works)

- `useMessageStorage` keys every message by `printerId:messageName`. Two printers can hold independent copies today.
- `EditMessageScreen` loads the focused printer's copy.
- `Sync Adjust` pulls Width/Delay/etc. from a printer and writes them back into that printer's stored copy.
- `Copy to Printers` dialog exists.
- `ApplyToPrintersDialog` grid with per-printer checkboxes exists.
- Rotation already resolves from the setup card in `buildEffectiveMessageDependentSettings`.
- Fleet defaults (W2, D500, Ultra Fast) applied when no stored settings exist.

**What's missing vs. the confirmed rules:**

| Gap | Impact |
|---|---|
| Copy to Printers overwrites target's Width/Delay/etc. | Violates Rule 2 |
| No "which printers have ever run this message?" list | No Squid-style pre-selected send |
| No per-printer history of "has ever received" | Can't drive pre-selection |
| Send failures show toasts, no Ignore/Try Again dialog | Rougher than Squid UX |
| Editor doesn't show a stack of per-printer blocks | Operator can't see divergence at a glance |

## 5. Work packages

### WP-1 — Copy preserves target tuning (Rule 2)
- In `copyMessageToPrinters` (in `src/pages/Index.tsx`), before writing to each target:
  - Load the target's existing stored copy of that message name.
  - If it exists, **retain its `adjustSettings`** and only replace content (fields, text, barcodes, prompt config).
  - If it doesn't exist, seed `adjustSettings` from the source (Rule 3).
- Rotation continues to be resolved from the target's setup card.
- Add a badge/toast: *"Kept existing tuning on Printer 4, Printer 7."*

### WP-2 — "Sent-to" history per message
- Extend the stored `MessageDetails` with `lastSentAt: Record<printerId, epoch>` (or a sibling map in storage — decide during implementation).
- Populate on every successful `^SV`/`^SM` push (Save, Select, Copy, Sync).
- Expose a helper `getPrintersThatHaveRun(messageName): number[]`.

### WP-3 — Pre-select "printers that have run this message" in dialogs
- `ApplyToPrintersDialog` (Copy) and the Select flow: on open, default-check every printer returned by `getPrintersThatHaveRun`.
- Source printer stays locked-checked.
- Operator can uncheck any target.
- "Select all" / "Clear" / group toggles stay.

### WP-4 — Ignore / Try Again on failed pushes
- Wrap each per-printer push in a promise that, on failure, resolves to `{ printerId, error }` instead of throwing.
- After the batch, if any failed, show a **Retry Failures** dialog listing each failed printer with reason and two buttons: **Ignore** (dismiss) and **Try Again** (re-runs just the failed set).
- Reuse for Copy, Select, Expiry, Sync Adjust.

### WP-5 — Per-printer stack view in the editor (Squid-style)
- New panel in `EditMessageScreen` (collapsible, off by default so mobile stays clean): **"This message on other printers"**.
- Renders a compact row per printer that has this message: printer number, Line ID, current W/D/Bold/Gap/Speed, rotation, last-sent timestamp.
- Read-only in v1 — pure visibility. (Per-row inline edit is a v2 candidate; not in this plan.)

### WP-6 — HMI-side selection acknowledgement (customer question)
- Verify `useSerializedPolling` / status parse already updates `currentMessage` when the HMI operator selects locally. If not, wire it.
- Confirm no code path re-issues `^SM` after detecting a local change (i.e. we don't fight the operator).
- Add a small note to `userManualContent.ts`: "Operators can select any stored message directly at the printer HMI; the PC will update to reflect it and will not push a different message unless you explicitly Select from the PC."

### WP-7 — Migration & safety
- No storage schema break: `printerId:messageName` keying is already in place.
- On first load after this ships, walk every stored message and, if `lastSentAt` is missing, backfill an empty map. No data loss.
- Feature flag: none needed — the changes are additive and match confirmed intent.

## 6. Out of scope (this phase)

- Per-lane inline text edits from the stack view (Squid allowed this; we can revisit).
- Auto-detecting HMI-side content edits (customer confirmed content edits happen only from the PC).
- Any change to Master/Slave grouping semantics.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Preserving target tuning hides a genuine desire to standardise | Add an explicit **"Overwrite tuning too"** checkbox in the Copy dialog (default OFF). |
| `lastSentAt` grows unbounded over years | It's one epoch int per printer per message — negligible. |
| Operators forget which printer they last tuned on | Stack view (WP-5) addresses this. |
| Retry dialog loop if a printer is truly dead | Cap retries at 3, then force Ignore. |

## 8. Rollout order

1. WP-1 (fixes the immediate rule violation).
2. WP-2 + WP-3 (unlocks Squid-style pre-selection).
3. WP-4 (better failure UX).
4. WP-6 (verification + doc note, low code).
5. WP-5 (nice-to-have visibility panel).

Each WP ships independently and is verifiable in isolation.

## 9. Acceptance criteria

- Copying Message 1 from Printer 1 to Printer 2 leaves Printer 2's stored W/D/Bold/Gap/Speed for Message 1 untouched; content updates.
- Copying Message 1 from Printer 1 to Printer 5 (which has never had Message 1) seeds Printer 5 with Printer 1's numbers.
- Opening Copy or Select shows every printer that has previously run the message pre-checked.
- A failed push surfaces a Retry/Ignore dialog naming the printer and reason.
- Selecting a message at the HMI updates the PC UI within one poll cycle and does not cause the PC to push a different message back.
- Rotation on every push equals the target's Printer Setup Card, regardless of what the source stored.
