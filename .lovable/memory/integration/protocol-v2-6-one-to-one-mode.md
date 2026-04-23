---
name: One-to-One Print Mode (Protocol v2.6, §6.1)
description: Authoritative spec for ^MB/^MD/^ME 1-to-1 mode and the R/T/C async acknowledgements — high-speed print confirmation without polling
type: feature
---

# One-to-One Print Mode — Authoritative Spec (Protocol v2.6, Chapter 6.1)

The ONLY mechanism in the v2.6 protocol that gives real-time per-print acknowledgements. Replaces ^CN polling for high-speed VDP.

## Entry Sequence
1. `^MB` → printer responds `OnetoOne Print Mode` / `1-1` (short) / errors with `? 7: JNR` (jet not running)
2. `^SM <messagename>` → select target message (may also be selected before ^MB)
3. `^MD^TDx;<data>` or `^MD^BDx;<data>` → push field updates (multiple subcommands allowed in one ^MD)
4. `^ME` → exit (REQUIRED to persist last message contents) → responds `Normal Print Mode` / `NORM`

## The Three Acknowledgements

After each valid `^MD`, the printer asynchronously emits **single ASCII characters** on the same TCP socket:

| Char | Meaning | Trigger |
|------|---------|---------|
| `R`  | **Ready** — print buffer updated | Valid ^MD received and parsed |
| `T`  | **Triggered** — photo eye seen | Photo eye fires AFTER R (any earlier PE is ignored) |
| `C`  | **Complete** — print finished | Print operation completed |

## Critical Wire Framing Rules

- ACKs arrive on the **same TCP socket** (port 23) as command responses — no separate stream.
- **No `>` success or `?` error responses** are sent for `^MD` while in 1-1 mode (response suppression to reduce latency).
- Each ACK is normally followed by `\r\n` (CR 0x0D + LF 0x0A).
- **CRITICAL:** Under high-speed operation, ACKs may be **coalesced** into a single line: `RT\r\n`, `TC\r\n`, or `RTC\r\n`. Parser MUST handle multi-char lines.
- Message buffer holds **4 messages max** (4 × 1020 bytes). If full, new ^MD is **silently discarded** (no error). Sender must rate-limit or use C/T pacing.
- `^MD` strings must end with CR (0x0D), max 1020 bytes, must contain at least one valid ^TD or ^BD.
- Invalid characters between commands are silently discarded — no response.

## Other Async Indications (also 1-1 socket)

- `DEF OFF\r\n` — High voltage (deflection) was disabled
- `JET STOP\r\n` — Jet stopped due to error (e.g. gutter fault). **1-1 mode auto-exits when this occurs.**

## Side Effects of ^MB Entry
- Editing on printer screen is disabled (adjust params still work)
- `^FE` (force photo eye) is **reset** — must re-enable each time
- `^DP` (trigger print delay) is **reset to 0** — must re-set each time
- `^MS` reports `1-1=ON` / `1-1=OFF` (short) or `OnetoOne mode=ON/OFF` (long)

## Implementation Implications for CodeSync

1. **Demuxer required:** TCP read loop must split each incoming chunk on `\r\n` and, for each line, check if the line is exactly composed of {R,T,C} chars (1–3 chars) → route to ACK handler. Anything else → normal command-response handler.
2. **No ^CN polling needed in 1-1 mode** — `C` IS the print completion signal, real-time per-print.
3. **Buffer pacing:** Maintain in-flight count = (sent ^MD) − (received C). Cap at 4 to avoid silent drops. Optimal: keep 2-3 in flight for pipelining.
4. **Timeout strategy:** If no `R` within ~500ms after ^MD, treat as buffer-full drop and retry.
5. **JET STOP / DEF OFF handlers:** Must immediately exit 1-1 state in app, surface fault, prompt reconnect.
6. **Always send `^ME` on exit** (including app close, error, mode change) — otherwise last message updates are LOST.
7. **Echo state irrelevant:** The R/T/C chars are emitted regardless of `^EN`/`^EF`. Suppression of `>`/`?` for ^MD is automatic in 1-1 mode.

## Reference Sequence (from §6.1 Figure)

```
Remote                  Dir   Printer
^MB                      →
                         ←    OnetoOne Print Mode
^SM rem1                 →
                         ←    Command Successful!
^MD^TD2;0002             →
                         ←    R                ← buffer accepted
   (photo eye fires)
                         ←    T                ← PE detected
                         ←    C                ← print done
^MD^TD2;0003             →
                         ←    R
                         ←    TC               ← coalesced under load
...
^ME                      →
                         ←    Normal Print Mode
```
