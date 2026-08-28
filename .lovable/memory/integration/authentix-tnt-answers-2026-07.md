---
name: Authentix TnT clarifications (July 17 2026)
description: Authoritative answers from Authentix on TwinCode/TnT integration — serial format, Config params, fault categories, ack policy, deployment, security.
type: feature
---

# Authentix answers — 17 July 2026 (AuthentixQuestionAnswers_July2026.docx)

1. **Serial/print-message format** — Interface Spec §5 defines the *full* Print Message:
   **17 chars without lot code, 24 chars with lot code**. The Serial No inside the
   message is the **starting** serial. CodeSync must print the whole formatted string
   and **increment the serial portion within that format** itself.
   → Supersedes the old "13-char serial" assumption.
2. **Config message** — Interface Spec §4 defines its parameters. **No** font / position /
   dot-size overrides. Config = template-select + starting serial + listed params only.
   Phase 2 stays a lookup table, not a general parameter writer.
3. **Qty=3 (Rule 3)** — means diversion setup "production = 3" = lid (DataMatrix) +
   side (alphanumeric). **Still 2 printers.** No third printer.
4. **Laser lot code** — out of scope; TnT will never ask CodeSync to drive it.
5. **Category 1 (out-of-sync)** — **fatal**. Line-stop and wait for re-Config. Do not
   absorb with retries.
6. **Category 2 sub-codes** — Interface Spec §8 lists **24** sub-codes (may be printer
   specific). Use that list verbatim; never guess.
7. **BottleClearBufferFaultCodeList** — owned by TnT config. **No operator config UI**
   needed in CodeSync.
8. **Deployment** — CodeSync TCP endpoint lives **locally on the line PC running
   CodeSync** (Electron). No headless relay build required.
9. **pcap** — Authentix will provide a live TnT↔DataJet capture (Config, ~10 Prints,
   Request, fault). Frame codec stays placeholder until it lands.
10. **Ack policy** — Ack = **message received**, not physical print confirmation.
    The Print msg is a *start printing* command, not a per-bottle print request.
    → Ack immediately on frame receipt; do not block on printer `C`.
11. **Re-Config after stall** — TnT increments the serial itself and sends the correct
    starting serial. **No rewind/resume logic** in CodeSync; treat re-Config exactly
    like an original Config.
12. **Security** — plaintext TCP on trusted subnet. **No TLS / auth** required.

## Open items
- Need Interface Spec §4, §5, §8 text to implement format, Config params, sub-codes.
- Need the pcap before finalising `electron/tntCodec.cjs` framing.
