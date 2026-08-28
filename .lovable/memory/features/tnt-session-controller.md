---
name: TnT session controller
description: Renderer-side controller wiring TnT TCP frames to the TwinCode dispatcher — Config reseeds serial counter, Print dispenses incremented serials, Category-1 fatal latch, Category-2 placeholder sub-codes.
type: feature
---

# TnT Session Controller (Phase 2 wiring)

- `src/twin-code/tntSessionController.ts` subscribes to `window.electronAPI.tnt.onFrame`
  and drives `twinDispatcher.dispatch()` per bottle.
- **CONFIG (0x10):** extracts §5 Print Message (provisional field names
  `printMessage|message|startMessage`), validates via `parsePrintMessage`,
  reseeds `PrintMessageCounter`, preflights ECC200 capacity (16x16 too small
  for 17–24 chars), sends STATUS. Re-Config = full reseed, clears fatal (Q11).
- **PRINT (0x20):** "start printing" — arms line, then `dispenseNext()` per
  bottle trigger; serial increments inside the fixed format.
- **REQUEST (0x30):** replies STATUS (last serial, dispensed, fault state).
- **Category 1 (fatal):** malformed Config, Print-before-Config, or serial
  wrap past field width → latch fault, stop line, wait for re-Config (Q5).
- **Category 2:** dispatch failures send FAULT with placeholder sub-code 0 —
  real sub-codes blocked on Interface Spec §8 (Q6). Never guess.
- ACKs stay in `electron/tntServer.cjs` on receipt (Q10); the server also
  edge-validates Config shape (17/24 chars, A–Z/0–9) and emits
  `config-invalid` events.
- Tests: `tntSessionController.test.ts` (10 tests, all passing).
- Blockers: spec §4/§5/§8 text + TnT pcap — see
  `/mnt/documents/TwinCode_Spec_Gap_Tracker.docx`.
