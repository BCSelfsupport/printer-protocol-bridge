---
name: PC Library overflow system
description: Stores saved messages on PC in a unified pool visible across all printers; pushing retains the original
type: feature
---
The PC Library stores messages in localStorage (`bestcode-pc-library`) keyed by `printerId:messageName`. When printer memory is full, users can:

1. **Save to PC** — backs up any printer message to the PC Library via the "Save to PC" button
2. **Push to Printer** — adds a separate PC Library message without replacing another printer message. Same-name conflicts are refused; a full printer must not cause another message to be deleted.

**Unified pool**: All PC Library messages are visible from any printer's Messages screen, regardless of which printer they were saved from. Each entry shows the source printer name. Messages can be pushed to any connected printer.

**Addition mechanism**: No swap slot is required. When pushing:
- Verify the destination does not already contain the same name.
- Add the PC Library message using the guarded message write path, without deleting or overwriting another message.
- The pushed message stays in PC Library for reuse; only explicit PC Library deletion removes it.

**Storage keys**: `bestcode-pc-library` (messages), `bestcode-swap-slot` (per-printer slot names).

**UI**: Collapsible "PC Library" section below the printer messages list in MessagesScreen. Shows source printer name, field count, push/delete actions.

**Files**: `useMessageStorage.ts` (storage + PcLibraryEntry type), `MessagesScreen.tsx` (UI), `Index.tsx` (wiring).
