---
name: Dozen12 Validation Point (v0.1.166)
description: Validated recovery baseline for prompt-save flow. v0.1.166 confirmed working for heavy prompt messages like Dozen12. Lists guards that must NEVER be re-added.
type: constraint
---

# Validated Recovery Point: v0.1.166 (Message #314)

**Status:** ✅ Validated working in production for Dozen12 and all prompt-before-print messages.

## What works at this version
- Prompt-before-print save flow (e.g. Dozen12) completes without printer firmware lockup
- `^DM` + `^NM` + `^SV` + `^SM` sequence executes cleanly
- Message selection after save is immediate and reliable
- All scan workflow, counter, and license features developed in the prior 3 days are intact

## Critical files in the validated flow
- `src/hooks/usePrinterConnection.ts` — `selectMessage`, `saveMessageContent`
- `src/components/screens/MessagesScreen.tsx` — save → select handler
- `src/lib/printerTransport.ts` — transport abstraction
- `electron/main.cjs` / `electron/preload.cjs` — TCP socket bridge

## ❌ NEVER re-add these (caused Dozen12 lockup in dev branch before revert)
- `writeLockRef` / `waitForWriteLockToClear` in `usePrinterConnection.ts`
- `getWriteTimingProfile` / `getPromptWriteTimingProfile` scaling logic
- `waitForPollingIdle` guards around save operations
- Artificial `settleBeforeSelectMs` / `settleAfterSelectMs` delays in MessagesScreen
- Any "scaled timeout" math based on field count or message size

**Why:** These guards were added defensively but introduced timing windows that interrupted the firmware's own save-then-select handling. The simple sequential flow (save → immediate select with only the polling pause) is what the firmware actually expects.

## Recovery procedure
If the prompt-save flow breaks again:
1. **Preferred:** Restore from Lovable History → version labeled `v0.1.166 — VALIDATED` (message #314)
2. **Surgical:** Re-port `selectMessage` and `saveMessageContent` from v0.1.166 commit into current `usePrinterConnection.ts`, and strip any settle/lock logic from `MessagesScreen.tsx` save handler
3. Reference prior baseline: production v0.1.165 (commit `34649a0`) had the same working logic

## Validation checklist for future changes to this flow
- [ ] Dozen12 message saves and selects without lockup
- [ ] Scan workflow still functional
- [ ] Counter dialogs still functional
- [ ] License/pairing features intact
