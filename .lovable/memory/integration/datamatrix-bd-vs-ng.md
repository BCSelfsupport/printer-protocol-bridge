---
name: DataMatrix in 1-1 mode — ^MD^BD vs ^NG bitmap upload
description: Customer (Authentix / Thomas Pawlik) confirms BestCode firmware accepts ^MD^BDx;<data> for native DataMatrix updates in one-to-one mode — no per-print bitmap upload required for the TwinCode hot path
type: feature
---

# DataMatrix in 1-1 Mode — Use ^BD, Not ^NG Bitmaps

## The customer correction (2026-04-23)

Thomas Pawlik (Chief Scientist, Brand Protection — Authentix), who has been
running comms tests on real BestCode hardware for the TwinCode development:

> "Andy, why wouldn't you be able to use `^MD^BD1;xxxx`?
> My BestCode printer accepts that for a DataMatrix code in one-to-one mode.
> And they are even in size, so they can't be ECC000-140."

Translation: the firmware **does** accept native barcode-field updates inside
^MD in 1-1 mode for DataMatrix targets, exactly like ^TD does for text fields.
The "even in size" comment confirms it's auto-selecting a square ECC200 matrix
(i.e. the field is a real DataMatrix barcode field, not a generic graphic).

## What this changes

Our existing `src/lib/dataMatrixGenerator.ts` (bwip-js → column-major hex →
^NG upload → swap graphic via ^AL) was built as a **workaround** for the case
where the firmware lacks native DataMatrix VDP. See:
`mem://features/barcode-ecc200-workaround`.

For TwinCode's hot path (catalog-fed 13-digit serials, lid printer, target
≥200 units/min) that workaround is **the wrong tool**:

| Approach | Per-print cost | Notes |
|---|---|---|
| ^NG bitmap upload + ^AL swap | hundreds of ms (encode + upload) | Drops throughput well below 200/min |
| **^MD^BD1;<serial>** (native) | single short ^MD frame | Same latency profile as ^TD; matches §6.1 |

## Implementation rule for TwinCode dispatcher

In `src/lib/twinDispatcher.ts`:

- The lid printer's DataMatrix field MUST be a **native barcode field** in the
  selected message (created via the editor's BarcodeFieldDialog with
  `barcodeType = 'datamatrix'`), not a Graphic field driven by ^AL.
- `dispatch(serial)` writes `^MD^BD<fieldA>;<serial>` to the lid printer
  (same single-frame pattern as the ^TD path on the side printer).
- Field-index sanity check on bind (^LF) MUST verify that `fieldA` resolves
  to a barcode-type field, not a text/graphic field. Surface a clear error
  if it doesn't.

The existing bwip-js / ^NG path is retained ONLY for:
- Editor preview rendering (unchanged)
- Models / firmware revisions that are confirmed to lack native DataMatrix
  support (fallback path, gated by capability detection — not the default)

## Reference

- Protocol §6.1: `mem://integration/protocol-v2-6-one-to-one-mode`
  — ^MD body accepts one or more `^TDx;…` and `^BDx;…` subcommands.
- Existing barcode field plumbing: `mem://features/barcode-system-v2-6`
- Workaround path (no longer the hot path for TwinCode):
  `mem://features/barcode-ecc200-workaround`
