---
name: TwinCode quick-start
description: 10-step bring-up checklist for first-time TwinCode hardware hookup. Print this and tape it next to the line.
type: feature
---

# TwinCode — Quick-Start Checklist

> Goal: Go from "two printers in boxes" to "first signed production run" in
> under 30 minutes. Each step has a clear pass/fail signal — don't move on
> until the previous step is green.

## 0. Pre-arrival (do before you're on site)
- [ ] Latest CodeSync installed on the host PC; you can launch and reach Setup.
- [ ] License is **FULL or DATABASE** tier (TwinCode is gated, see
      mem://features/licensing-tier-gating).
- [ ] Catalog CSV is on the PC (1 column = serial, 13 chars per row).

## 1. Network the printers
- [ ] Both printers on the **same subnet** as the PC (e.g. 192.168.0.x).
- [ ] Telnet / Remote Comms **enabled** on each printer's HMI
      (mem://integration/printer-hardware-setup).
- [ ] Firewall allows TCP **port 23** outbound from the PC.
- [ ] **Pass signal:** `ping <printer-ip>` succeeds for both.

## 2. Confirm jets running
- [ ] Lid printer: jet on, no faults on HMI.
- [ ] Side printer: jet on, no faults on HMI.
- [ ] **Pass signal:** Both printers display "READY" / "Print Ready".

## 3. Open TwinCode in CodeSync
- [ ] Navigate to **TwinCode** (left nav).
- [ ] **Pass signal:** Conveyor visualizer loads, "Bind Twin Pair" button visible.

## 4. Bind the pair
- [ ] Click **Bind Twin Pair**.
- [ ] **Side A (LID):** enter IP + port (default 23) + friendly name ("Lid · L1").
      Leave message name as `LID`, field `1`, subcommand `BD`.
- [ ] **Side B (SIDE):** same with `SIDE`, field `1`, subcommand `TD`.
- [ ] Leave **"Auto-create on bind if missing" ON** for both sides.
- [ ] Click **Bind**.
- [ ] **Pass signal:** Toast "Bound LID + SIDE" (and "Seeded LID & SIDE" if the
      messages weren't on the printers yet).

## 5. Visual cross-check
- [ ] Look at the **Selected messages** strip in the conveyor panel.
- [ ] Side A shows a 16×16 DataMatrix block, message name `LID`, `f1 · ^BD`.
- [ ] Side B shows the text `DRYRUN0000000`, message name `SIDE`, `f1 · ^TD`.
- [ ] Walk to each printer; confirm the HMI shows the **same message name** as
      the preview.
- [ ] **Pass signal:** Both HMIs match the preview cards.

## 6. Pre-flight dry run
- [ ] Toggle **LIVE** on (top of conveyor panel).
- [ ] Click **Dry run ×5**.
- [ ] **Pass signal:** Green chip "✓ 5/5 · cycle <Xms> · skew <Yms"`.
      Also walk to the printers and verify 5 real bottles' worth of prints
      came out with the dry-run serials.
- [ ] If red: read the dry-run reason in the chip tooltip; common fixes are at
      the bottom of this sheet.

## 7. Load the catalog
- [ ] Click **Load CSV catalog**, pick the file, confirm the serial column.
- [ ] **Pass signal:** Counter shows "Catalog total = N", "Remaining = N".

## 8. Configure the conveyor
- [ ] Set **Line speed (ft/min)** to your real conveyor speed.
- [ ] Set **Pitch (mm)** to your real bottle pitch.
- [ ] Set **Bottle Ø (mm)** to the bottle diameter.
- [ ] **Pass signal:** Computed BPM matches the line operator's expectation.

## 9. Start the production run
- [ ] Click **Start Production Run**, enter operator name + lot number.
- [ ] LIVE stays ON, conveyor stays in production mode (no synthetic Start).
- [ ] **Pass signal:** Real bottles trip the photocell; LID + SIDE printer
      counters increment in lockstep; HUD BPM matches the line.

## 10. End the run
- [ ] Click **End Run** when the lot is finished.
- [ ] Download the **signed CSV/JSON audit export**.
- [ ] **Pass signal:** Export downloads; SHA-256 footer is present.

---

## Common failure → fix

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Bind toast says "^MB failed: JNR" | Jet not running on that printer | Start the jet on the HMI, retry bind |
| Bind aborts: "field 1 is 'graphic', expected barcode" | Manual message has wrong field type | Delete the manual message OR turn auto-create off and rebuild it correctly |
| Bind aborts: "^LM failed" | Telnet briefly unresponsive | Wait 5s, retry; if persists check port 23 firewall |
| Dry run red: "timeout-C" | Printer not actually in 1-1 mode | Power-cycle the printer, retry bind |
| LIVE prints but only A or only B fires | Wrong subcommand on a side | Check **Selected messages** strip — A must say `^BD`, B must say `^TD` |
| "Catalog already consumed" on load | Same fingerprint as previous run | Use the **Resume** banner instead of reloading |
| Audible miss alarm during run | Bottle reached end-of-line with no print | Check fault recovery banner, resume from bottle N |

## Where to look when things go sideways
- **Toast/snackbar copy** — most failures surface there with the protocol-level reason.
- **Operator HUD** — A/B status lights tell you which side is misbehaving.
- **Dev panel** (5-tap on Activate, password `TEXAS`) — manual protocol terminal
  to issue `^LM` / `^LF` / `^SU` against either printer for debugging.
- **mem://features/twin-code-fault-recovery** — recovery flow reference.
