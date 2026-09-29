# Wire & Cable Package (new license tier)

A dedicated "Wire & Cable" edition of CodeSync, sold on its own licence like TwinCode. It includes everything in the Database edition, plus scan-to-print job loading and cable-specific marking tools.

## What the operator will do

```text
Production sheet  ->  Scan code (USB scanner or phone)  ->  Choose printer
      ->  CodeSync looks up the job  ->  Shows a preview and asks to confirm
      ->  Sends the message to that printer and selects it
      ->  Resets the length/print counters  ->  Logs the job
```

No typing and no picking from a list, so the wrong message can't be chosen by mistake.

## Features in version 1

1. **Wire & Cable licence tier**: a new tier that unlocks the Database features plus a new Wire & Cable workspace. The Developer licence also unlocks it.
2. **Job table (from a database or CSV)**: import or link the job list. One column holds the job/order ID printed on the sheet, and the other columns hold the text to print (cable type, section, batch, and so on). Reuses the existing Data Sources screens.
3. **Scan-to-print**:
   - USB scanner: an always-listening scan box on the Wire & Cable screen. It catches the fast keystrokes a scanner types and the Enter key at the end.
   - Phone camera: reuses the mobile companion scan feature that already exists.
   - Two ways to read the sheet code: **Lookup** (the code is a job ID, matched against the job table) or **Direct** (the code holds all the fields, split by a separator you set). You choose the mode in settings until your colleague sends a sample sheet.
   - Printer choice: scan a printer's label first (for example "P3"), or use the printer that's currently selected.
   - A confirm screen shows the job, the printer and a message preview, then sends it using the existing safe save sequence (create the message, save it, then select it).
4. **Metre/foot numbering**: a running length mark driven by the encoder and pitch settings we already have. Choose metres or feet, a starting value and the step size. Where the printer's own counter can do it, the count runs on the printer itself.
5. **Counter reset per job**: loading a new job zeroes the length and print counts.
6. **Tower printing and flip-flop**: tower orientation choices, and alternating the print direction on every print so the code reads from either direction. Built on the Flip-Flop feature that's already there.
7. **Job log/report**: records each job's time, sheet code, printer, operator, metres/feet printed and print count. Can be exported to CSV.

The workspace is laid out so more cable features can be added later. Non-transfer ink notes are left out for now.

## Open items (questions for your colleague)
- A sample production sheet, so we know what's in the barcode and whether it's a 1D or 2D code.
- The job database they use (Excel/CSV export, SQL, or another system).
- Whether the printer needs to show running metres itself or whether the PC count is enough.

## Technical details
- Tier: add `wirecable` to the `license_tier` enum (migration) and to `LicenseTier`; add `canWireCable` (wirecable or dev). `canDatabase` also becomes true for wirecable. Update `generate-license` and the dev panel tier picker.
- New route `/wire-cable` (`src/pages/WireCablePage.tsx`) with its own screens under `src/wire-cable/`. The old Wire & Cable screen is folded in as the "Line Setup" tab.
- Scanner hook `useKeyboardWedgeScanner` (keystrokes arriving under 50ms apart, ending in Enter).
- Job lookup against `data_source_rows` by the chosen ID column; field mapping reuses the print-job mapping format.
- Send flow reuses `copyMessageToPrinters`-style serialization: `waitForPollingIdle`, `^NM` then `^SV` then `^SM`, with 300ms gaps. Commands are checked against protocol v2.6. The length counter uses documented `^CC`/counter fields only.
- New table `cable_job_log` (license-scoped, with GRANTs and row-level security that follows the existing license-header pattern).
- A feature entry in What's New; memory updated.
