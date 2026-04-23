---
name: TwinCode serial format — 13-char alphanumeric, identical on both printers
description: Customer-confirmed serial shape for the bonded TwinCode pair (Authentix). 13 chars, mixed letters+digits, identical string on lid (DataMatrix) and side (text), case-significant.
type: feature
---

# TwinCode Serial Format

## Customer-confirmed example (2026-04-23)

> "Alphanumeric and 2D have the same data: Example `25X221546754U`."
> — Thomas Pawlik, Authentix

## Shape

- **Length:** 13 characters
- **Charset:** uppercase A–Z + 0–9 (case-significant — `X` and `U` are payload, not decoration)
- **Identity rule:** the **exact same string** is dispatched to both printers
  - A (lid) → encoded into the 16×16 ECC200 DataMatrix via `^MD^BD<fieldA>;<serial>`
  - B (side) → printed as human-readable text via `^MD^TD<fieldB>;<serial>`
- **No per-side transform** — no padding, prefixing, case-folding, or check-digit
  recomputation. The catalog row IS what goes on the wire on both sides.

## Implications

| Concern | Resolution |
|---|---|
| DataMatrix size | 16×16 (s=5 in `^AB`) is correct — comfortably encodes 13 alphanumeric chars in ECC200 |
| Code128 vs DataMatrix | Not relevant — lid is always 2D DataMatrix per customer spec |
| Mixed case in editor | The side-printer text field MUST allow mixed case (see `mem://features/mixed-case-text-support`). Forced uppercase would corrupt this payload — but since the payload is already uppercase + digits, the failure mode is silent on this dataset. Don't rely on it. |
| Catalog validation | Reject rows that aren't `/^[A-Z0-9]{13}$/`. CSVs with leading zeros stripped by Excel ARE a real risk — load as text columns. |
| Dry-run seed | When `catalog.peek()` returns null, the dispatcher synthesises `DRYRUNxxxx` (10 chars, won't match production length). For a more realistic dry-run, prefer loading a real catalog first. |

## Reference

- Dispatcher: `src/twin-code/twinDispatcher.ts` — `dispatch(serial)` writes the
  same `serial` to both sides
- BD vs TD subcommand routing: `mem://integration/datamatrix-bd-vs-ng`
- Mixed-case text fields: `mem://features/mixed-case-text-support`
