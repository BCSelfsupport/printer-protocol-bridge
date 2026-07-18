# Per-Printer Message Settings — Implementation Design

**Status:** Design / pre-implementation
**Related SOW:** Sent to customer (Per-Printer Message Settings)
**Author:** Lovable + Citec
**Date:** 2026-07-18

---

## 1. Goal

Every physical printer keeps its **own private copy** of each message's adjust
settings (Width, Delay, Bold, Gap, Pitch, Speed). Rotation continues to be
driven exclusively by the Printer Setup Card (Flip / Mirror Flip). Editing a
setting on Printer 1's copy of "Message 1" never changes Printer 2's copy of
"Message 1".

The customer's plain-English framing: *"a message's correct settings are a
property of the combination of message + printer, not of the message alone."*

---

## 2. What already exists (baseline)

The storage layer is already correctly shaped for this feature — we do NOT need
a schema migration. Confirmed via `src/hooks/useMessageStorage.ts`:

- `STORAGE_KEY = 'bestcode-messages-v2'`
- Records are keyed by the composite key **`${printerId}:${messageName}`**
- `saveMessage`, `getMessage`, `deleteMessage`, `renameMessage`,
  `getMessageNames` all scope to `printerId`.
- Each stored `MessageDetails` already carries its own `adjustSettings`
  (`PrintSettings` from `src/types/printer.ts`).
- PC Library is also per-printer keyed.
- Legacy fallback: if a per-printer record is missing, `getMessage` falls back
  to the `printerId=0` copy so old data is not lost.

What is **not** yet correct is a set of code paths that assume "message name
identity" implies "shared settings":

1. Copy-to-printers duplicates the source's `adjustSettings` unconditionally
   into every target, overwriting any tuning the target already had for that
   name.
2. Master → Slave sync (`syncMessageToSlaves`) fans out the master's full
   message body including `adjustSettings`.
3. `selectMessageOnAnyPrinter` uses the source printer's stored settings when
   the target has no stored record; the fallback needs to be explicit and
   auditable.
4. HMI edits (Width/Delay changed at the printer, Save pressed) are only
   captured through the on-demand **Sync Adjust** button — not automatically.

This document defines how to bring those four paths in line with the SOW.

---

## 3. Customer decisions we still need (blockers)

The SOW asked four questions. Implementation branches depend on answers:

| # | Question | Effect on code |
|---|----------|----------------|
| 1 | Independent per-printer settings — confirm? | Locks in the whole design. If "no", cancel this doc. |
| 2 | Copy → target that already has a copy: **keep** target's numbers or **overwrite**? | Drives `copyMessageToPrinters` branch. |
| 3 | First-time send: seed with source printer's numbers? | Drives fallback logic in Select + Copy. |
| 4 | Rotation always from Setup Card — confirm? | Already implemented; just need confirmation. |

**Assumed defaults for this document (change if customer says otherwise):**
- Q1: Yes (independent per-printer).
- Q2: **Keep target's numbers** — content copies, settings stay.
- Q3: Yes — seed once from source, then it's the target's forever.
- Q4: Yes — rotation from Setup Card only.

---

## 4. Behavioural spec (what the operator sees)

### 4.1 Editing a message

- Opening "Message 1" while focused on Printer 1 loads **Printer 1's copy**.
- Every Width/Delay/Bold/Gap/Pitch/Speed change is written back only to
  Printer 1's record. Printer 2's "Message 1" is untouched.
- Rotation control in the editor is either hidden or shown as read-only ("From
  Setup Card: Flip") to prevent confusion.

### 4.2 Selecting a message (`^SM`)

Order of precedence used to build the adjust settings actually pushed:

1. **Target printer's stored `adjustSettings` for this message name** (primary).
2. Else, if the target has no record: **seed from source printer's copy**
   (first-time-send), immediately persist to the target so we never re-seed.
3. Else, if nothing exists anywhere: **fleet defaults**
   (`FLEET_DEFAULT_ADJUST_SETTINGS`: W2, D500, Ultra Fast).
4. **Rotation** is always overridden from the target printer's Setup Card,
   regardless of steps 1–3.

### 4.3 Copy to Printers (bulk)

- The **body** of the message (fields, text, barcode data, template) always
  copies.
- **Adjust settings on the target:**
  - Target already has a record for that name → **keep target's settings**
    (default per Q2).
  - Target does not have a record → **seed with source settings** and persist.
- Rotation always resolved from each target's Setup Card at push time.

### 4.4 Master → Slave sync

Same rule as Copy: content syncs, settings preserved per-slave. A slave that
has been tuned locally will not have its Width/Delay re-clobbered every time
the master edits the message text.

### 4.5 HMI edit capture ("auto-adopt")

When a technician changes Width/Delay at the printer and hits Save, we already
have `syncAdjustFromPrinter` for the manual sync button. Implementation
options:

- **Option A (safe / default):** Keep manual only. Add a subtle banner
  "Printer values differ from stored — Sync?" when we detect drift during a
  poll cycle.
- **Option B (auto):** After every successful `^SV` observed on the printer,
  query current settings and write to the target's stored record.

We recommend **Option A** for the first release — auto-adopt risks silently
overwriting good stored values if the operator was mid-tuning.

---

## 5. Code changes

All changes are frontend / presentation-layer. No backend, no schema, no
migration.

### 5.1 `src/pages/Index.tsx`

**`buildEffectiveMessageDependentSettings(targetPrinterId, messageName, sourceSettings?)`**
Refactor to a strict precedence resolver:

```ts
function resolveEffectiveAdjustSettings({
  targetPrinterId,
  messageName,
  sourceSettings,      // from operator action (Select / Copy source)
  targetPrinter,       // for rotation from Setup Card
}): { settings: PrintSettings; origin: 'target' | 'seeded' | 'default' } {
  const stored = getMessage(messageName, targetPrinterId)?.adjustSettings;
  let base: PrintSettings;
  let origin: 'target' | 'seeded' | 'default';

  if (stored)             { base = stored;          origin = 'target'; }
  else if (sourceSettings){ base = sourceSettings;  origin = 'seeded'; }
  else                    { base = FLEET_DEFAULT_ADJUST_SETTINGS; origin = 'default'; }

  return {
    settings: { ...base, rotation: rotationFromSetupCard(targetPrinter) },
    origin,
  };
}
```

Callers:

- `selectMessageOnAnyPrinter` — when `origin === 'seeded'`, persist the seeded
  record to the target's storage immediately (so future selects hit the
  `'target'` branch).
- `copyMessageToPrinters` — same seeding rule per target.
- `syncMessageToSlaves` — same seeding rule per slave.

### 5.2 `src/hooks/useMessageStorage.ts`

Add a targeted helper so the resolver above is one call, not
"getMessage → mutate → saveMessage" boilerplate:

```ts
updateAdjustSettings(messageName: string, next: PrintSettings, overridePrinterId?: number): void
```

And a read helper that never falls back across printers (needed by the
resolver — the existing `getMessage` falls back to `printerId=0`, which
would break per-printer isolation):

```ts
getMessageStrict(messageName: string, printerId: number): MessageDetails | null
```

The legacy `getMessage` stays for backwards compatibility with call sites that
want the old fallback behaviour (editor open, etc.).

### 5.3 `src/components/screens/EditMessageScreen.tsx`

- Continue to load the focused printer's copy (already correct).
- On save, only write to the focused printer's record (already correct).
- Rotation control: render as read-only chip labelled *"Rotation is set on the
  Printer Setup Card"* linking to that card. Prevents operator confusion.

### 5.4 `src/components/printers/ApplyToPrintersDialog.tsx` (copy mode)

Add a per-row hint next to each target:
- Green pip *"Will seed from source"* when the target has no stored record.
- Yellow pip *"Keeps existing settings"* when the target already has a record.

This makes the Q2 behaviour visible to the operator instead of implicit.

### 5.5 `src/hooks/useMasterSlaveSync.ts`

- Rewrite the sync path to call the same resolver (5.1) so slaves seed once
  and are then treated as owning their settings.
- Add a small "was-tuned" flag on the stored record
  (`adjustSettingsTunedAt: number`). If set, the sync path logs "preserving
  local tuning on Slave N" instead of overwriting.

### 5.6 Small type addition — `src/types/printer.ts`

Extend `MessageDetails` (in `EditMessageScreen.tsx`) — not `PrintSettings` —
with optional provenance:

```ts
adjustSettingsOrigin?: 'target' | 'seeded' | 'default';
adjustSettingsTunedAt?: number; // epoch ms when user last hand-edited
```

Used only for diagnostics + the "was-tuned" preservation logic above.

---

## 6. Migration / backfill

None required at the DB level (all `localStorage`). One-time migration on
first load after this release:

- For every existing `${printerId}:${messageName}` record that has no
  `adjustSettings`, stamp `FLEET_DEFAULT_ADJUST_SETTINGS`. This is the same
  behaviour as today's `applyStoredAdjustSettings` fallback but persisted so
  the resolver's `'target'` branch is hit on first select.

- Records under the legacy `printerId=0` bucket are left in place; the
  resolver only reads them if a printer has no per-printer record yet, which
  matches Q3's "seed on first send".

---

## 7. Diagnostics (so we can prove it works)

Add three console log tags — the codebase already uses `[AdjustDebug]`
prefixes:

- `[AdjustDebug][resolve]` — payload: `{ printerId, messageName, origin, source }`
- `[AdjustDebug][seed]` — payload: `{ printerId, messageName, seededFromPrinterId }`
- `[AdjustDebug][preserve]` — payload: `{ printerId, messageName, reason: 'target-has-record' }`

Add a small "Adjust Origin" chip to the Adjust dialog header
(`src/components/adjust/AdjustDialog.tsx`) that shows Target / Seeded /
Default so QA can visually confirm which branch fired without opening
DevTools.

---

## 8. Rollout plan

1. **Phase 0 — customer signoff** on the four SOW questions. Blocks
   everything below.
2. **Phase 1 — resolver + storage helpers** (§5.1 + §5.2). Behind a
   feature-flag `PER_PRINTER_ADJUST_V2` in `src/lib/devAccess.ts` so we can
   ship dark and test on one printer.
3. **Phase 2 — wire callers** (Select, Copy, Sync) to the resolver. Still
   flagged.
4. **Phase 3 — UX polish** (editor rotation chip, dialog seed hints, Adjust
   origin chip).
5. **Phase 4 — flag on** for the 13-printer customer, monitor logs, add
   release notes entry via `WhatsNewDialog`.
6. **Phase 5** — decide on HMI auto-adopt (§4.5 Option B) as a follow-up
   ticket, not part of this release.

---

## 9. Risk register

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Operator edits M1 on P1 expecting fleet-wide change | Medium | Editor header shows "Editing Printer 1's copy of M1"; help tooltip. |
| First-time send seeds wrong numbers | Low | Seed is transparent (chip in dialog) and immediately editable per-printer. |
| Master edits M1 text, slaves silently keep old text | Low | We only preserve *adjust settings*, not fields/text. Text always syncs. |
| Legacy records under printerId=0 get shadowed | Low | Backfill script (§6) plus legacy fallback path in `getMessage`. |
| Feature flag left on partially | Medium | Single flag gates all four call sites; no partial rollout. |

---

## 10. Out of scope

- Cross-printer "settings profile" library (e.g. "Left side / Right side"
  presets). Deferred.
- HMI auto-adopt on `^SV` (Option B in §4.5). Deferred to follow-up.
- Rotation as a per-message override (customer explicitly does not want this).
- Any protocol changes. `^CM` / `^NM` / `^SM` payloads are unchanged; we're
  only changing what we choose to send.

---

## 11. Acceptance criteria

1. Editing Width on Printer 1's Message 1 leaves Printer 2's Message 1
   Width unchanged (verified via storage inspector).
2. Selecting Message 1 on Printer 1 sends the values stored under
   `1:Message 1`. Selecting the same message on Printer 2 sends the values
   stored under `2:Message 1`.
3. Copying Message 1 from Printer 1 → Printer 3 (which has no record) results
   in Printer 3 getting a `3:Message 1` record seeded from Printer 1.
4. Repeating that copy after Printer 3 has hand-tuned Delay does **not**
   overwrite Printer 3's Delay.
5. Rotation on any of the above is always the target printer's Setup Card
   value.
6. `[AdjustDebug][resolve]` log shows `origin: 'target'` for every second and
   subsequent select of the same message on the same printer.
