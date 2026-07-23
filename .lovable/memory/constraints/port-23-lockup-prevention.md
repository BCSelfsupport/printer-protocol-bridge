---
name: Port-23 lockup prevention layers
description: Every renderer path that opens a socket or writes ^-commands to a BestCode printer MUST go through runPrinterWriteExclusive + record via printerCommandLog. Polling hooks, dev panel, and diagnostics all guarded. Dead unguarded useElectronPrinter hook removed.
type: constraint
---

# Port-23 lockup prevention — invariants

BestCode printers lock up (requiring power-cycle) when two writers overlap on the single port-23 Telnet session, especially during the post-^NM digest window. These layers together prevent it. **Do not remove or bypass any of them.** There is no `^SV` command in protocol v2.6.

## The layers

1. **`runPrinterWriteExclusive(printerId, fn)`** in `src/lib/printerWriteQueue.ts` — per-printer serial promise chain. Also tracks `activeLocks` set so the transport tripwire can detect unguarded writes.
2. **`beginSaveBusy()` / `isSaveBusy()`** in `src/lib/saveBusy.ts` — sticky flag (with 4s grace) around save-class commands (`^NM`, `^NF`, `^DM`). Fleet telemetry and polling defer while true.
3. **`printerTransport.sendCommand` tripwire** in `src/lib/printerTransport.ts` — in DEV, logs `[portGuard] UNSAFE WRITE during saveBusy without exclusive lock` with stack trace whenever a caller bypasses the guards. Also records every command to the ring buffer regardless of build mode.
4. **`printerCommandLog`** in `src/lib/printerCommandLog.ts` — 500-entry per-printer ring buffer. `window.exportPrinterLog(printerId)` downloads a plain-text post-mortem for support tickets.

## Callers — all MUST be guarded

- ✅ `Index.tsx sendVerifiedCommandSequence` — wraps in `runFleetWriteExclusive(runPrinterWriteExclusive(...))` + `beginSaveBusy`
- ✅ `useMasterSlaveSync sendCommandToPrinter` / `sendCommandSequenceToPrinter`
- ✅ `useSerializedPolling` — the whole tick runs inside `runPrinterWriteExclusive(printerId, ...)`, with `isSaveBusy` fast-path bail AND re-check after lock acquisition
- ✅ `useServiceStatusPolling` — same pattern
- ✅ `DevPanel handleSendCommand` / `handleQuickCommand` — via `dispatchGuardedCommand` (waits for save-idle, takes exclusive lock, marks save-busy for ^NM/^NF/^DM)
- ✅ `DiagnosticTestProcedure` — `connectPrinter` / `disconnectPrinter` / `sendCmd` all take the exclusive lock; connect waits for save-idle first
- ✅ `oneToOneController` — runs on the connected printer's persistent socket, serialized by main.cjs command queue
- ❌ `useElectronPrinter.ts` — **DELETED**. Was dead code and would bypass every guard. Do NOT re-add.

## Rules for new code

- Any new file that calls `window.electronAPI.printer.sendCommand` or `.connect` directly is WRONG. Use `printerTransport.sendCommand` instead, wrapped in `runPrinterWriteExclusive` when the caller is starting a multi-command transaction or a mutation.
- Save-class commands (`^NM`, `^NF`, `^DM`) MUST be wrapped in `beginSaveBusy()` so background uploaders/polling defer. Never add `^SV`; it is not a valid command.
- Background polling loops MUST bail on `isSaveBusy()` at BOTH tick entry AND before each write inside the loop (TOCTOU).
- If a diagnostic or maintenance tool needs its own socket, take `runPrinterWriteExclusive` and `waitForSaveIdle` first — never open a second Telnet session on a printer the main app already has connected.

## Post-mortem: how to debug a lockup

1. Have the operator run `window.exportPrinterLog(<printerId>)` in DevTools. This downloads the last 500 commands with timestamps, `saveBusy`/`lockHeld` flags, durations, and responses.
2. Check the DEV console for `[portGuard]` warnings/errors — these identify the offending caller by stack trace.
3. If the last command before hang is `^NM` or `^NF`, check if another caller fired within the digest window without `lockHeld=true`.
