---
name: TwinCode serial / print-message format
description: Authentix-confirmed print message shape — 17 chars (no lot code) / 24 chars (with lot code), serial incremented by CodeSync inside the format; identical string on lid (DataMatrix) and side (text).
type: feature
---

# TwinCode Print Message Format

## Authoritative (Authentix, 2026-07-17)

> "Section 5 of our Interface spec lays out the full Print Message format,
> 17 char for No Lot Code msg, 24 char for With Lot code. The Serial No in the
> Print message indicates the **starting** Serial Code. The BestCode logic will
> need to use this full message format and increment the Serial Code within the
> overall format."

- **Length:** 17 chars (no lot code) or 24 chars (with lot code) — the whole
  formatted string is what gets printed, e.g. `3 001 08 A180 220274 U`.
- **Serial authority:** TnT sends the *starting* serial in the Config/Print msg;
  CodeSync increments the serial sub-field per bottle, preserving the surrounding
  fixed template characters and zero-padding.
- **Re-Config:** TnT supplies the correct next starting serial. CodeSync never
  rewinds or resumes on its own — treat re-Config identically to an original Config.

## Identity rule
The **exact same full string** goes to both printers:
- A (lid) → ECC200 DataMatrix via `^MD^BD<fieldA>;<message>`
- B (side) → human-readable text via `^MD^TD<fieldB>;<message>`

No per-side transform (no padding, prefixing, case-folding, check digits).

## Implications
| Concern | Resolution |
|---|---|
| DataMatrix size | 16×16 encodes 13 chars; **17–24 alphanumeric chars needs a larger ECC200 size** — re-check `^AB` size param against the real payload length before go-live. |
| Side text width | 17–24 chars at 7×5 font must fit the print window — validate template width in preflight. |
| Mixed case / spaces | Payload contains spaces and uppercase letters; text field must not force-uppercase or trim (see `mem://features/mixed-case-text-support`). |
| Catalog CSVs | Prior `/^[A-Z0-9]{13}$/` validation is obsolete — validate against the §5 format instead; load columns as text. |

## Historical note
Earlier guidance (2026-04-23, "Alphanumeric and 2D have the same data:
`25X221546754U`", 13 chars) described only the serial portion. The 17/24-char
full-message format above supersedes it for wire payloads.

## Reference
- Dispatcher: `src/twin-code/twinDispatcher.ts`
- BD vs TD routing: `mem://integration/datamatrix-bd-vs-ng`
- Full Q&A: `mem://integration/authentix-tnt-answers-2026-07`
