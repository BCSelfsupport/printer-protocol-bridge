# Wire & Cable Tower Print

## Goal
Add a Tower Print control to Edit Message for Wire & Cable licences. Tower Print uses the documented message-orientation values 4–7, which rotate the characters for cable marking; it is not an undocumented field command.

## Changes
- Add a Wire & Cable-only Tower Print toggle in Edit Message, clearly applying to the whole message even when a field is selected.
- Preserve each target printer’s existing Normal / Flip / Mirror / Mirror Flip direction and translate it to the matching Tower orientation when saving, selecting, copying, syncing, or scan-sending the message.
- Extend the shared orientation types and protocol mappings to all eight documented values:
  - 0 Normal, 1 Flip, 2 Mirror, 3 Mirror Flip
  - 4 Tower, 5 Tower Flip, 6 Tower Mirror, 7 Tower Mirror Flip
- Correct the existing Wire & Cable flip-flop map, where Mirror and Mirror Flip are currently reversed.
- Read Tower orientations back from the printer without losing them, and make the emulator retain/report the selected orientation for testing.
- Update the message preview so Tower Print visibly rotates each character, while retaining the message’s normal left-to-right field layout.
- Add focused tests for orientation conversion, command generation, and printer read-back.

## Safety
- Keep Tower Print unavailable on non-Wire & Cable packages (developer access remains included).
- Continue using each printer’s Setup Card orientation as the base direction; Tower Print adds the Tower variant rather than replacing fleet-specific direction settings.
- Use the existing serialized save/copy paths and required `^SV`; no additional live commands or polling behavior will be introduced.

## Validation
- Verify a Tower message saves with `^NM ...;o4–o7;...` as appropriate for each target printer.
- Reopen the message and confirm Tower Print remains enabled.
- Check normal and Tower previews on desktop and mobile, plus copy-to-printers and scan-to-print behavior.
