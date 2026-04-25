---
name: Twin Code statement of work
description: Authoritative scope, behaviors, and bring-up checklist for the bonded LID+SIDE TwinCode system. Read first when changing anything in /src/twin-code.
type: feature
---

# TwinCode — Statement of Work (consolidated)

## Goal
Bond two BestCode printers as a single logical unit ("twin pair") that
applies a 13-digit serial twice per bottle: a native ECC200 DataMatrix on
the lid (A) and a human-readable text rendition on the side (B). Catalog
serials feed the dispatcher; cycle target ≈300ms (200 units/min).

## Operating principle
- **Single source of truth = the catalog.** Every serial is consumed exactly once.
  Localstorage ledger + FNV fingerprint guard against double-consume across reloads
  (mem://features/twin-code-catalog-persistence).
- **A and B always print the same serial.** Dispatcher fans out one ^MD per side in
  parallel; both must reach `C` before the cycle is counted printed.
- **Speed-of-light skew matters.** Per-cycle profiler captures wire RTT, A/B skew,
  and full cycle ms; surfaced in the operator HUD.
- **Hardware errors are loud, never silent.** ^LF field-shape sanity check, fault
  guard for jet-stop / disconnect / miss-streaks, post-fault resume banner.

## Layered guarantees (each one independent — defence in depth)
1. **Bind dialog** — operator picks A/B IPs and per-side message/field/subcommand,
   confirms the wire sequence in the dialog footer.
2. **Auto-create on bind** — `^LM` check; if the configured message name is missing,
   the dispatcher seeds the canonical shape and `^SV`s before `^SM` selects it
   (mem://features/twin-code-auto-create-messages).
3. **^LF field-shape sanity check** — after `^SM`, the dispatcher verifies the
   target field index exists AND has the right type (`text` for `^TD`, `barcode`
   for `^BD`). Bind aborts on mismatch with a clear error.
4. **HMI message preview** — TwinMessagePreview renders both selected messages
   (DM 16×16 for A, 7×5 text for B) so the operator can eyeball-confirm before
   going LIVE. Mirrors the regular CodeSync printer-connect preview.
5. **Pre-flight dry run** — 5 real bonded dispatches, no catalog effects, with a
   pass/fail verdict and full timing (mem://features/twin-code-preflight).
6. **Fault guard** — jet-stop / disconnect / miss-streak detection auto-pauses the
   conveyor and offers a resume-from-bottle-N banner.

## Canonical message shapes (auto-seeded on bind)
LID uses a 16-dot template (DM 16×16 needs the height); SIDE uses a 7-dot
template (Standard 7×5 text fills it exactly — no wasted vertical pad).

| Side | Template | Field | Type | Update path | Placeholder |
|------|----------|-------|------|-------------|-------------|
| A (LID)  | 16-dot | 1 | Native ECC200 DataMatrix 16×16 (`^AB s=5`) centered, bottom-anchored | `^MD^BD1;<serial>` | `DRYRUN0000000` |
| B (SIDE) |  7-dot | 1 | Standard 7×5 text, left-aligned, sized for 13 chars (`^AT font=1`) | `^MD^TD1;<serial>` | `DRYRUN0000000` |

Seeds live in `src/twin-code/messageSeeds.ts`. Seeds are **never overwritten** —
operator hand-tweaks (font swap, extra label, position nudge) survive subsequent
binds as long as the field at the configured index still matches the expected
type (the ^LF check enforces this).

## Architecture
```
catalog.peek() ──► conveyorSim photocell ──► twinDispatcher.dispatch(serial)
                                              │
                                              ├─► PrinterSession A  (^MD^BD1;serial → R/T/C)
                                              └─► PrinterSession B  (^MD^TD1;serial → R/T/C)
                                              │
                                              └─► profiler bus + live metrics + ledger commit
```
See mem://features/twin-code-live-dispatcher for the PrinterSession lifecycle.

## UI surfaces (hand off in this order to the operator)
1. **TwinPairBindDialog** — IP/port + per-side message config + auto-create toggle.
2. **TwinMessagePreview** strip in ConveyorPanel — selected messages at a glance.
3. **OperatorHUD** — big BPM, last serial, A/B status lights, audible miss alarm.
4. **ProductionRunBar** — lot-locked runs, signed CSV/JSON export.
5. **LedgerResumeBanner / FaultRecoveryBanner** — post-event recovery flows.

## Bring-up gating (what must be true before LIVE)
- Both printer IPs reachable on port 23 (single telnet session per printer).
- Jet running on both (^MB rejects with JNR otherwise).
- Per-side message exists OR auto-create is enabled.
- ^LF field-shape check passes for both sides.
- Pre-flight dry run × 5 passes (recommended, not enforced).

## Out of scope (deferred / explicitly excluded)
- Serial-port (USB/RS-232) twin pairs — IP-only for v1.
- Mixed-template pairs (both sides locked to 16-dot template by the seed).
- Inline DM-from-text encoding on the printer for >ECC200 sizes.
- More than two bonded printers per pair (use multiple pairs instead).

## Documentation cross-refs
- Quick-start: `mem://features/twin-code-quick-start`
- Auto-create on bind: `mem://features/twin-code-auto-create-messages`
- Per-pair config: `mem://features/twin-code-per-pair-config`
- Live dispatcher: `mem://features/twin-code-live-dispatcher`
- Pre-flight: `mem://features/twin-code-preflight`
- Production run: `mem://features/twin-code-production-run`
- Operator HUD: `mem://features/twin-code-operator-hud`
- Catalog persistence: `mem://features/twin-code-catalog-persistence`
- Fault recovery: `mem://features/twin-code-fault-recovery`
- Live metrics: `mem://features/twin-code-live-metrics`
- DataMatrix BD vs NG: `mem://integration/datamatrix-bd-vs-ng`
- Protocol v2.6 1-1 mode: `mem://integration/protocol-v2-6-one-to-one-mode`
