---
name: Twin Code per-pair dispatch config
description: TwinPairBindDialog now stores per-side messageName, fieldIndex, and ^MD subcommand on each TwinPrinterBinding; ConveyorPanel passes them into twinDispatcher.bind() so LIVE mode targets the right field on the right message without code changes.
type: feature
---

# Twin Code — Per-Pair Dispatch Config

## What changed
Each side of a bonded twin pair (A = lid, B = side) now carries its own
dispatch config in `twinPairStore` so the LIVE bind path no longer relies
on dispatcher defaults that only happen to match Authentix's layout.

## TwinPrinterBinding shape
```ts
interface TwinPrinterBinding {
  kind: "ip" | "serial";
  name: string;
  ip: string;
  port: number;
  messageName?: string;     // ^SM target on bind, e.g. "LID" / "SIDE"
  fieldIndex?: number;      // 1-based field index inside that message
  subcommand?: "BD" | "TD"; // ^MD^BD = barcode-data, ^MD^TD = text-data
}
```

All three new fields are optional so v1 store entries (pre-config) keep
loading. Migration happens in `twinPairStore.migrateBinding`.

## Defaults seeded by TwinPairBindDialog
| Side | messageName | fieldIndex | subcommand |
|------|-------------|------------|------------|
| A (lid)  | `LID`  | 1 | `BD` |
| B (side) | `SIDE` | 1 | `TD` |

Customer rule of thumb: "one message per printer, name it for what it is."
Operator can override per pair. Inputs validate IP, port (1-65535), field
index (1-99), and message name (1-32 chars, uppercased on input).

## Wire format on LIVE bind
```
^MB → ^SM <messageName> → ^MD^<BD|TD><fieldIndex>;<serial> → ... → ^ME
```
The dialog renders a live preview of this frame as the operator types so
they can confirm the wire shape before saving.

## TwinDispatcherOptions additions
```ts
messageNameA?: string;  // takes precedence over `messageName` for side A
messageNameB?: string;  // takes precedence over `messageName` for side B
```
`bind()` now uses `opts.messageNameA ?? opts.messageName` per side, so A
and B can run completely different message names (the customer's actual
setup) instead of being forced to share one.

## Files
- `src/twin-code/twinPairStore.ts` — extended binding shape + migration
- `src/twin-code/components/TwinPairBindDialog.tsx` — config inputs + wire preview
- `src/twin-code/twinDispatcher.ts` — per-side messageName fields, bind() wiring
- `src/twin-code/components/ConveyorPanel.tsx` — pulls config from store on enableLive()

## Field-index sanity check still runs
`PrinterSession.verifyFieldIndex` parses `^LF` after entry and rejects bind
if the configured field doesn't exist OR if its type doesn't match the
chosen subcommand (BD vs TD). Skipped only on emulator pairs and when
`opts.skipFieldCheck === true`.
