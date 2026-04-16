---
name: PC Library overflow system
description: Stores overflow messages on PC when printer memory is full, with swap-slot push mechanism
type: feature
---
The PC Library stores messages in localStorage (`bestcode-pc-library`) keyed by `printerId:messageName`. When printer memory is full, users can:

1. **Save to PC** — backs up any printer message to the PC Library via the "Save to PC" button
2. **Push to Printer** — replaces a designated "swap slot" message on the printer with a PC Library message

**Swap slot mechanism**: Each printer has one configurable swap slot (`bestcode-swap-slot` in localStorage). When pushing:
- The current swap slot message is saved to PC Library first
- The PC Library message is created on the printer via `^DM + ^NM + ^SV`
- The pushed message becomes the new swap slot
- The pushed message is removed from PC Library (it's now on the printer)

**UI**: Collapsible "PC Library" section below the printer messages list in MessagesScreen. Shows field count, push/delete actions.

**Files**: `useMessageStorage.ts` (storage methods), `MessagesScreen.tsx` (UI), `Index.tsx` (wiring).
