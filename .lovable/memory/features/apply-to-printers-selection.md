---
name: Apply to Printers selection dialog
description: Multi-target message selection replaces auto Master→Slave fan-out; operators pick target printers per selection.
type: feature
---

# Apply to Printers — selection UX

When the operator clicks Select on a message, `MessagesScreen.handleSelectMessage`
opens `ApplyToPrintersDialog` (source locked-checked, siblings grouped by
Master group / Ungrouped, remembers last selection per source in
`localStorage['apply-to-printers:last-selection']`).

## Fan-out rules

- **Keyboard prompt** — `UserDefineEntryDialog` opens once, value baked into
  fields, then `onApplyPromptValuesOnPrinter` (= `applyPromptValuesToPrinter`)
  is called in parallel per target. Uses switch-away + `^NM` + `^SM`; never `^SV`.
  No HMI interaction on any target.
- **No prompt** — `onSelectOnPrinter` (= `selectMessageOnAnyPrinter`) fires
  plain `^SM` per target in parallel.
- **Scanner prompt** — source-only. Warn + skip extras if operator checks
  multiple targets (the phone can only fulfil one scan job at a time).

Parallel fan-out is safe: each printer has its own socket +
`runPrinterWriteExclusive` lock. Wall-clock is roughly the slowest single
printer, not N × single printer.

## Legacy Master→Slave auto-sync

- `Printer.autoSyncSelection?: boolean` (Master only, default **OFF**).
- `useMasterSlaveSync` selection-fanout `useEffect` gated on
  `connectedPrinter?.autoSyncSelection === true`.
- Toggle lives in `EditPrinterDialog` when role === 'master'.
- All other sync (fault mirror, expiry offsets, sync-status pip, content
  push after save) stays unconditional.

## Slave selection no longer blocked

The `role === 'slave'` block in `Index.tsx onSelect` (both desktop and
mobile MessagesScreen usages) was removed. Operators can select a message
on any printer including slaves.

## Files

- `src/components/printers/ApplyToPrintersDialog.tsx` — dialog
- `src/components/screens/MessagesScreen.tsx` — `runSelectionAcrossTargets`,
  `runSelectionOnSource`, multi-target branch inside `UserDefineEntryDialog.onConfirm`
- `src/pages/Index.tsx` — `selectMessageOnAnyPrinter` helper +
  `sourcePrinter` / `siblingPrinters` / `onSelectOnPrinter` /
  `onApplyPromptValuesOnPrinter` props
- `src/hooks/useMasterSlaveSync.ts` — `autoSyncSelection` gate
- `src/components/printers/EditPrinterDialog.tsx` — Master toggle
