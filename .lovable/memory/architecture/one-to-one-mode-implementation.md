---
name: One-to-One Mode Implementation (R/T/C demuxer + controller)
description: How the v2.6 §6.1 1-to-1 print path is wired across Electron main, preload, transport, and the renderer-side controller
type: feature
---

# One-to-One Mode Implementation

End-to-end wiring of the v2.6 §6.1 high-speed print path. Companion file: `mem://integration/protocol-v2-6-one-to-one-mode`.

## Architecture (3 layers)

```
src/lib/oneToOneController.ts        ← renderer state machine, pacing, deadlines
       ↑↓ IPC oneToOne:*
electron/preload.cjs                  ← exposes window.electronAPI.oneToOne
       ↑↓
electron/main.cjs (demuxer)           ← splits TCP stream into ACK / fault / text
       ↑↓ persistent socket (port 23)
   PRINTER
```

## Demuxer (electron/main.cjs)

- `attachOneToOneDemuxer(printerId)` adds a dedicated `data` listener on the printer's persistent socket.
- Splits the byte stream on `\r\n` / `\n` / `\r`, classifies each line:
  - **1–3 chars composed only of {R,T,C}** → emit `oneToOne:ack` per char
  - **`JET STOP`** → emit fault `JET_STOP` (auto-exits 1-1 in controller)
  - **`DEF OFF`** → emit fault `DEF_OFF`
  - Anything else → ignored (the normal `sendCommandToSocket` pipeline still owns command-response framing for ^MB/^SM/^ME).
- Demuxer is auto-detached when the underlying socket is removed from `connections`.

## Renderer controller (`src/lib/oneToOneController.ts`)

Singleton `oneToOneController` with state machine: `idle → entering → active → exiting → idle` (or `fault → idle` on `JET STOP`).

### Pacing (the critical piece)
- Hardware buffer = **4 messages**; `MAX_IN_FLIGHT = 4`, recommended pipelining target = 3.
- `dispatch(mdCommand)` blocks while at MAX, returns a Promise that resolves on `C` (or fails on timeout/fault).
- Per-print deadlines: `R_TIMEOUT_MS = 500` (silently-dropped ^MD), `C_TIMEOUT_MS = 30000` (PE-bound).

### ACK matching
- FIFO: incoming `R` matches the oldest in-flight without an R; `T` matches oldest with R but no T; `C` matches oldest without C.
- `^MD` is sent via `oneToOne:sendMD` IPC — fire-and-forget write, NO response awaited (1-1 mode suppresses `>`/`?` for ^MD).
- All other commands (^MB / ^SM / ^ME) still go through normal `sendCommandToSocket`.

### Polling safety
- On `enter()`: stashes prior `isPollingPaused()` then calls `setPollingPaused(true)` so ^SU/^CN/^TM/^LE never interleave with the ACK stream.
- On `exit()`: only resumes polling if the controller was the one to pause it (avoids fighting mobile companion pause).
- `JET STOP` triggers automatic teardown without ^ME (printer already left mode).

### Fallback paths
- PWA / non-Electron: `oneToOne.sendMD` is unavailable → controller emulates instant R/T/C so demos don't deadlock. Real 1-1 mode requires Electron transport.
- Relay mode: not yet implemented (relay HTTP API has no async push channel for ACKs).

## IPC surface

| Channel              | Direction          | Purpose                                |
|----------------------|--------------------|----------------------------------------|
| `oneToOne:attach`    | renderer → main    | Add ACK demuxer to socket              |
| `oneToOne:detach`    | renderer → main    | Remove ACK demuxer                     |
| `oneToOne:sendMD`    | renderer → main    | Fire-and-forget ^MD write              |
| `oneToOne:ack`       | main → renderer    | `{kind:'ack',char:'R'\|'T'\|'C'}` or `{kind:'fault',code:'JET_STOP'\|'DEF_OFF'}` |

## Usage example

```ts
import { oneToOneController } from '@/lib/oneToOneController';

await oneToOneController.enter(printerId, { messageName: 'rem1' });

oneToOneController.setEvents({
  onComplete: (r) => profilerBus.push({ ts: Date.now(), rtt: r.rttMs, ok: r.ok }),
  onFault: (code) => alertUser(code),
});

for (const serial of catalogIterator()) {
  await oneToOneController.dispatch(`^MD^TD2;${serial}`);  // resolves on C
}

await oneToOneController.exit();   // REQUIRED — without ^ME last update is lost
```

## Files
- `electron/main.cjs` — demuxer + IPC handlers
- `electron/preload.cjs` — `window.electronAPI.oneToOne` API
- `src/types/electron.d.ts` — `OneToOneAPI` types
- `src/lib/oneToOneController.ts` — state machine + pacing
