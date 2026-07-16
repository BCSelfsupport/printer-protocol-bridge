
## What we're changing

Today, when the operator selects a message on the **Master**, it automatically fires the same selection to every printer in that Master's group. The customer wants the reverse: **no automatic fan-out**. Instead, whenever any printer (Master, Slave, or ungrouped) has a message selected on it, the app pops up a dialog asking *"Also select this on which other printers?"* — the operator ticks the ones they want and only those get the message (with a single user-prompt entry if the message has one).

## New selection flow

1. Operator picks any printer in the sidebar and opens Messages.
2. Operator taps **Select** on a message.
3. **New dialog opens**: "Apply *MessageName* to which printers?"
   - Grid of large cards, one per online printer (excluding the source printer, which is implicit)
   - Each card shows: printer number, Pack Line ID (falls back to printer name), IP, current selected message, an obvious checkbox
   - Group headers (Group A / Group B / Ungrouped) so the operator can visually scan by line
   - Header controls: **Select all**, **Select all in this group**, **Clear**
   - Footer: **Cancel** and **Select on N printer(s)**
4. If the message has a **user-prompt field**, hitting Select opens the existing `UserDefineEntryDialog` **once** — the value is baked and pushed to every checked printer (source + checked targets) exactly the way the Broadcast dialog does it today. No HMI interaction on any slave.
5. If no prompt, Select fires straight to all checked printers.

Each target printer gets the same atomic write sequence we already use: `^DM` → `^NM` (fields baked) → `^SV` → `^SM`, in parallel per-socket. The existing `runPrinterWriteExclusive` lock, 28 s prompt-ack ceiling, and FAIL/OK pip on each printer card still apply.

## What happens to the old Master→Slave auto-sync

Kept as a **per-group option**, defaulted **OFF** for new/existing groups. Group settings gets a toggle:

> **Auto-sync message selection from Master** — When ON, selecting a message on the Master immediately applies it to all Slaves in this group (legacy behaviour). When OFF (default), use the "Apply to printers" dialog to choose targets each time.

That preserves the workflow for anyone who wants hands-off group sync, but the customer's default experience is the new opt-in dialog.

## What we're NOT changing

- Master/Slave grouping, roles, and everything else that depends on them (fault sync, expiry offsets, sync-status pip) — untouched.
- The existing **Broadcast dialog** (per-slave user-define values, used when different lines need different data) — stays as-is, still reachable from the Master card.
- Message editing, save flow, `^NM`/`^SV`/`^SM` protocol — unchanged.
- Offline detection, polling, port 23 handling — unchanged.

## Open questions before I build

1. **Default checkbox state** in the new dialog: all printers **pre-checked**, all **unchecked**, or **remember the last selection** the operator made? My recommendation is *remember last selection* so a line running the same fleet-wide message doesn't force re-ticking every time.
2. **Card label priority**: show **Pack Line ID first, printer name as fallback**, or always show both? (I'd show Line ID prominently with printer name as small subtitle.)
3. **Should the source printer appear as a locked/checked card** in the grid (visual confirmation "this one is definitely getting it") or be hidden entirely? I lean toward showing it locked-checked at the top.
4. Confirm the **legacy auto-sync toggle** should default OFF for **existing** groups too (i.e. this changes behaviour on tomorrow's push), or stay ON for existing groups and OFF only for newly created ones?

---

## Technical notes (for reference)

- New component: `src/components/printers/ApplyToPrintersDialog.tsx` — grid of `PrinterTargetCard`s grouped by A/B/Ungrouped, driven by `printers` from `usePrinterStorage`.
- Hook the dialog into `MessagesScreen.handleSelectMessage` **before** the current select path: if the group's `autoSyncSelection` flag is OFF (new default), open the picker; on confirm, run the existing prompt/scan/select path once per checked printer (parallel, per-socket, using the same code paths as Broadcast).
- Add `autoSyncSelection: boolean` (default `false`) to the group config in `usePrinterStorage`, with a migration that sets existing groups to whatever we decide in Q4.
- Gate `useMasterSlaveSync`'s selection-fanout branch on `group.autoSyncSelection === true`. All other sync (fault mirror, sync-status pip) stays live.
- Prompt handling reuses `UserDefineEntryDialog` + the same "bake fields into `^NM` and fan out in parallel" logic already in `BroadcastMessageDialog` — no new firmware interactions.

Once you answer the 4 questions above I'll build it.
