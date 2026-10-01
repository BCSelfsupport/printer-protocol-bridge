import { useEffect, useState } from 'react';
import { Sparkles, Wrench, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface ReleaseNote {
  id: string;
  type: 'feature' | 'bugfix';
  title: string;
  date: string;
  summary: string;
}

const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: 'graphic-list-from-printer',
    type: 'bugfix',
    title: 'Graphic Picker Lists the Printer\'s Real Graphics',
    date: '1 Oct 2026',
    summary:
      'When adding a graphic to a message, the list now comes straight from the graphics uploaded to the connected printer instead of a fixed sample list. Selecting one shows a dot-for-dot preview, and a refresh button re-reads the printer.',
  },
  {
    id: 'graphics-show-in-preview',
    type: 'bugfix',
    title: 'Graphics Now Show in the Message Preview',
    date: '1 Oct 2026',
    summary:
      'Messages containing a graphic showed an empty placeholder in the editor. CodeSync now downloads the picture from the printer and draws it dot-for-dot in the preview, at its real size (up to 32 dots high). Pictures are remembered, so they appear instantly next time.',
  },
  {
    id: 'field-bold-sent-to-printer',
    type: 'bugfix',
    title: 'Field Bold Now Reaches the Printer',
    date: '1 Oct 2026',
    summary:
      'Setting Bold on a field showed in the editor but the printer printed it at normal weight. Bold on text fields is now saved into the message itself, and bold date, time, counter and barcode fields are applied as the message is selected.',
  },
  {
    id: 'repeat-print-pitch-mode-gating',
    type: 'bugfix',
    title: 'Repeat Print and Pitch Only Appear in the Right Print Modes',
    date: '1 Oct 2026',
    summary:
      'Repeat Print and Pitch could be set while Print Mode was Normal, where they do nothing. Repeat Print now appears only when Print Mode is set to Repeat — it switches on automatically when you choose Repeat and turns off when you leave it. Pitch now shows only in modes that use it (Auto, Repeat, Select ID, Auto Encoder), not in Normal mode.',
  },
  {
    id: 'select-id-only-in-select-id-mode',
    type: 'bugfix',
    title: 'Select ID Code Only Appears in Select ID Print Mode',
    date: '1 Oct 2026',
    summary:
      'The Select ID Code option in Print Mode settings could be switched on while another print mode was chosen, which was confusing. It now appears only when Print Mode is set to Select ID, switches on automatically when you choose that mode, and turns off when you pick a different mode.',
  },
  {
    id: 'message-list-selection-highlight',
    type: 'bugfix',
    title: 'Selected Message No Longer Stays Highlighted Green',
    date: '1 Oct 2026',
    summary:
      'Fixed a confusing highlight in the message list: after selecting a message, the row stayed green, which looked the same as the message currently active on the printer. The picked row now shows a neutral grey highlight, and green is reserved for the message that is actually printing on the printer.',
  },
  {
    id: 'field-left-edge-hard-stop',
    type: 'bugfix',
    title: 'Fields Can No Longer Be Dragged Past the Left Edge',
    date: '30 Sep 2026',
    summary:
      'Fixed a bug where dragging a field (or a grouped date) towards the left of the message canvas could push it past the edge of the printable area, where part of the print would be lost. The left edge is now a hard stop: the field stops exactly at the boundary while grouped fields keep their spacing.',
  },
  {
    id: 'firmware-cable-upload',
    type: 'feature',
    title: 'Firmware Updates Over a PC Cable — No Thumb Drive Needed',
    date: '15 Sep 2026',
    summary:
      'Firmware updates no longer require copying files to a USB stick. A new firmware panel lets you connect the printer with the PC-to-printer cable, drop in the firmware ZIP (or an already-extracted folder) and CodeSync extracts and uploads it directly. Archive handling is safe — it ignores junk folders like __MACOSX and normalizes paths — so the update reaches the printer exactly as the manufacturer posted it.',
  },
  {
    id: 'offline-printer-cards',
    type: 'feature',
    title: 'Cleaner Printer Cards With a True Offline State',
    date: '11 Sep 2026',
    summary:
      'Printer cards have been tidied up so status is easier to read at a glance. The selection ring is now clearly separate from the connection indicator, offline printers show a clear offline placeholder, and the OK / ink / makeup indicators are hidden when a printer is offline instead of showing stale readings. The CONNECTED chip has been removed, online/offline can be set per printer (with all-online and all-offline shortcuts), and the emulator now mirrors exactly the printers you have configured — no more seeded demo printers.',
  },
  {
    id: 'repeat-print',
    type: 'feature',
    title: 'Repeat Print',
    date: '10 Sep 2026',
    summary:
      'Added Repeat Print so a message can be printed multiple times per product or per trigger, using the printer\'s documented repeat functions. The message "Select Code" field has also been renamed "Select ID Code" and is now a clearable numeric input, so picking the right ID code is quick and mistakes are easy to undo.',
  },
  {
    id: 'training-video-studio',
    type: 'feature',
    title: 'Built-In Training Video Recorder and Library',
    date: '21 Aug 2026',
    summary:
      'Every feature can now have its own training video, recorded by you — real screen recordings, not motion graphics. The new video editor supports trimming (with non-destructive backups and Undo Trim), the recording controls are hidden from the finished video, and each clip opens and closes with the branded CodeSync wordmark. Videos live in a structured library, and video management is restricted to authorized users.',
  },
  {
    id: 'editor-date-grouping',
    type: 'feature',
    title: 'Dates Now Move as One Piece in the Message Editor',
    date: '30 Sep 2026',
    summary:
      'Dates built from pieces like DD - MM - YYYY no longer have to be moved one character at a time. A single click on any piece selects the whole date and dragging moves it as one block, so pieces stay perfectly spaced. Double-click a piece to edit just that part, and an Ungroup button (with Group to re-join) splits a date apart for anyone who really wants separate fields. For picking several separate fields at once, Ctrl+click (Cmd+click on Mac) adds fields to the selection, and font size, gap and bold changes now apply to everything selected. On touch screens, press-and-hold selects the whole group.',
  },
  {
    id: 'european-date-readback-fix',
    type: 'bugfix',
    title: 'European Dates Keep Day-First Order When Re-Edited',
    date: '30 Sep 2026',
    summary:
      'Fixed a bug where a European date such as DD-MM-YYYY edited and saved correctly, but came back as 30-30-2026 when the message was opened again. The printer reports only the printed numbers, not what each one means, so CodeSync was guessing which pair was the day and picking wrong. The editor now remembers the date parts you set when the message was saved and only guesses when there is nothing saved to go on.',
  },
  {
    id: 'stacked-lines-template-save-fix',
    type: 'bugfix',
    title: 'Two-Stacked-Line Messages No Longer Overlap After Saving',
    date: '29 Sep 2026',
    summary:
      'Fixed a bug where a message with a top line and a bottom line (for example a 7-high part number over a 7-high date code) looked correct in the editor, but after saving and reopening every field was stacked on the bottom row, overlapping. The message was being saved on a single-line template, which the printer treats as one row. When all fields use the same font size and sit on separate rows, CodeSync now saves the message on the matching multi-line template instead (2L×7, 3L×7, 2L×9 and so on), so the printer keeps the lines apart. Messages that really are one line are not affected.',
  },
  {
    id: 'tower-print',
    type: 'feature',
    title: 'Tower Print: Per-Character Vertical Printing (Wire & Cable)',
    date: '29 Sep 2026',
    summary:
      'Wire & Cable messages can now print each character rotated upright so text reads down the cable like a tower. In the message editor, a slim Tower Print bar sits just above the message preview with Standard and Reversed direction buttons: Standard reads CBA top-to-bottom, Reversed turns each letter the other way so it reads ABC, while keeping the character order. The preview updates live and the choice is saved, copied to other printers and sent with the message. New fields are also placed just to the right of whatever is already on the line, so they never land hidden underneath existing fields.',
  },
  {
    id: 'emulate-button-placement',
    type: 'bugfix',
    title: 'Emulate Printers Button Tidied Next to the Clock',
    date: '29 Sep 2026',
    summary:
      'The Emulate Printers button is now a small round icon that matches the other toolbar buttons, with hover text, and sits beside the time and date at the far right of the header on desktop and mobile — with a clear gap from the CodeSync logo.',
  },
  {
    id: 'wire-cable-package',
    type: 'feature',
    title: 'New Wire & Cable Package: Scan-to-Print Cable Jobs',
    date: '29 Sep 2026',
    summary:
      'A new Wire & Cable licence (includes everything in Database). The Cable screen now has four tabs. Scan to Print: scan the job barcode on the production sheet with a USB scanner (works anywhere on the screen) or the phone companion; CodeSync looks the job up in your job table, shows a confirmation, then writes the job data into the message on the chosen printer, saves it and selects it, with no typing or picking from a list. Scan a printer label like "P3" to choose the printer. Job Setup: pick the job table, the job ID column, an optional message-name column and which column fills each message field; optionally reset the print counter on every new job and set a length counter start value. Line Setup: the existing pitch, encoder, metre/foot, tower and flip-flop settings. Job Log: every job with its printer, operator, length and print count, exportable to CSV.',
  },
  {
    id: 'sync-all-printer-clocks',
    type: 'feature',
    title: 'Sync All Printer Clocks From Your PC',
    date: '18 Sep 2026',
    summary:
      'Added a "Sync All Printers…" button next to "Sync to PC" on the Date / Time screen (calendar-clock button in the top toolbar). It lists every online printer with all pre-ticked, so you can untick any you want to skip, then sets each one\'s date and time from your PC one printer at a time. Network safety is built in: fleet status polling is paused before the sync starts, printers are updated strictly one at a time with settling gaps between commands, and polling only resumes a second after the last printer finishes — so syncing the whole fleet will not cause the dropped-connection issues seen in the past. A confirmation shows how many printers synced and any that failed.',
  },
  {
    id: 'clock-sync-button-toolbar',
    type: 'feature',
    title: 'Printer Clock Sync Now Reachable From the Toolbar',
    date: '18 Sep 2026',
    summary:
      'The Date / Time setup screen existed but was previously unreachable from the UI. A calendar-clock button is now pinned in the top toolbar and opens "Setup: Date / Time" directly, where "Sync to PC" sets the connected printer\'s date and time from your PC. Time entries without seconds are now accepted, and the date and time commands are sent with the correct settling delay so the printer accepts both reliably.',
  },
  {
    id: 'header-emulate-toggle',
    type: 'feature',
    title: 'Emulate Printers Toggle in the Main Header',
    date: '17 Aug 2026',
    summary:
      'The Emulate Printers toggle is now available to everyone. A green button is pinned in the main top toolbar (desktop) and labelled Emulate on mobile, so sales teams can demo the fleet without any extra setup.',
  },
  {
    id: 'start-jet-targets-selected-printer',
    type: 'bugfix',
    title: 'Start Jet Countdown Now Appears on the Correct Printer',
    date: '17 Aug 2026',
    summary:
      'Fixed a bug where pressing Start Jet on one printer could start the countdown on a different card. Jet Start/Stop now targets the operator-selected printer in the list, not the globally connected printer, so the 66 s startup animation appears on the printer you actually clicked.',
  },
  {
    id: 'connected-vs-selected-cards',
    type: 'bugfix',
    title: 'Printer Cards Distinguish Connected vs Selected',
    date: '17 Aug 2026',
    summary:
      'Tightened the visual priority of printer cards so only the operator-clicked selection shows the blue ring. The currently connected printer is now shown with a subtle green border and a small CONNECTED chip, preventing confusion when two cards looked highlighted.',
  },
  {
    id: 'printer-card-name-only',
    type: 'bugfix',
    title: 'Copy/Select Printer Cards Show Only the Printer Name',
    date: '17 Aug 2026',
    summary:
      'Removed the Line ID chip from the Copy-to-Printers and Select-Message dialogs. Cards now display the printer name exactly as configured (e.g. Printer 1, Printer 2), so the Line ID can no longer be mistaken for part of the name.',
  },
  {
    id: 'multi-line-7-template-spacing',
    type: 'bugfix',
    title: 'Multi-Line 7-Dot Template Spacing Fixed',
    date: '12 Aug 2026',
    summary:
      'Fixed the on-screen preview for 2-line and 3-line 7-dot templates so lines no longer touch vertically. The template parser now applies a standard 1-dot inter-line gap across all multi-line templates, matching the printer HMI layout. 2L×7 lines are now rendered at the correct heights and 3L×7 lines are spaced at 9 / 17 / 25 instead of being pushed down and overlapping.',
  },
  {
    id: 'bottom-nav-adjust-button-restored',
    type: 'bugfix',
    title: 'Bottom-Nav Adjust Button Opens Adjust Dialog Again',
    date: '12 Aug 2026',
    summary:
      'Fixed the bottom navigation Adjust shortcut so it opens the Width / Delay / Bold / Gap / Speed / Rotation Adjust dialog again, instead of opening the printer Setup Card. The Setup Card is still reachable from the printer list and printer detail views.',
  },
  {
    id: 'message-name-hyphen-allowed',
    type: 'bugfix',
    title: 'Message Names Now Accept Dashes',
    date: '12 Aug 2026',
    summary:
      'Fixed message name validation so part numbers and other names containing hyphens (for example "ABC-123") are accepted when creating or renaming messages.',
  },
  {
    id: 'hmi-yellow-save-button-fix',
    type: 'bugfix',
    title: 'Yellow Save Button Now Clears After Copy / Select / Delete',
    date: '11 Aug 2026',
    summary:
      'Fixed the persistent HMI "Save" LED (yellow button) that appeared on some printers after copying, selecting or deleting a message. CodeSync now sends the correct ^SV flash-save command after write batches, which tells the firmware to commit the edit buffer and release the Save LED. This also prevents the dirty-buffer state from blocking message deletion.',
  },
  {
    id: 'adjust-dialog-overrides-and-nav',
    type: 'feature',
    title: 'Adjust Dialog Cleanup, Per-Message Overrides & Bottom-Nav Adjust Shortcut',
    date: '23 Jul 2026',
    summary:
      'Reworked the Message Adjust dialog based on live feedback from the 13-printer fleet test. Rotation and Speed are now hidden inside the message editor because those are always resolved from the Printer Setup Card (Flip / Mirror Flip) and the printer-level Speed at Select time — showing them in the message was misleading. Override checkboxes are now inverted: unticked = inherit from Printer Setup Card / Fleet Defaults, ticked = "custom value for this message (ignores printer Setup Card)". A new Done / Done & Save footer button replaces the awkward X-to-close pattern — in the message editor Done & Save stores the message settings in one click; in live-adjust mode Done simply confirms the live values already sent. The Printer Setup Card section is renamed "New Printer Defaults" to make it clear it seeds brand-new messages only. Finally, the mobile Bottom-Nav Adjust shortcut no longer opens the confusing global Adjust dialog — it opens the connected printer\'s Setup Card directly.',
  },
  {
    id: 'width-force-push-every-select',
    type: 'bugfix',
    title: 'Width Now Sticks on Every Message Select',
    date: '23 Jul 2026',
    summary:
      'Fixed a follow-up to the Width 15 bug where the first select of a message pushed the correct Width (from the Printer Setup Card / Fleet Defaults) but a subsequent select on the same printer would revert to the printer\'s baked-in Width 15 / Delay 100. Root cause: if a message\'s stored adjustSettings had lost the width/delay/speed keys (via legacy save, race with the HMI sync, or partial capture), CodeSync silently skipped ^PW / ^DA and left the HMI\'s defaults in place. Every ^SM now unconditionally force-pushes the resolved Width, Delay, Bold, Gap and Pitch (Message Override → Printer Setup Card → Fleet Defaults → Factory Fallback), so a second, third and Nth select always land on the correct values. Update 11 Aug: ^SV was reinstated as the correct flash-save command after the protocol document was confirmed to be out of date; it is now sent after write batches to commit the edit buffer.',
  },
  {
    id: 'fault-popup-screen-lock-fix',
    type: 'bugfix',
    title: 'Fault Pop-Ups Can No Longer Lock the Screen',
    date: '22 Jul 2026',
    summary:
      'Fixed a bug where a printer fault (for example "Fault 01-0001: Fluid not detected in gutter") could lock up CodeSync if the fault image failed to load. The dialog now always shows a visible header with the fault code and severity, renders the fault message text even when the image is missing, and provides reachable OK / Next fault and Dismiss all buttons in a footer. Image fallback logic cycles through variants and collapses the image area entirely if none are available, so the operator can always clear the alert and continue.',
  },
  {
    id: 'ui-cleanup-dashboard-sync',
    type: 'feature',
    title: 'Cleaner Dashboard and Printers Screen',
    date: '22 Jul 2026',
    summary:
      'Removed the What\'s New tile from the mobile Dashboard (the sparkles button in the Network Printers sidebar is now the single entry point). Removed the fleet-wide Sync Adjust button and the per-printer Sync Adjust button from the Printers screen — the new per-printer "New Message Defaults" section on the Printer Setup Card makes manual syncing redundant.',
  },
  {
    id: 'stop-all-jets-stale-flag-fix',
    type: 'bugfix',
    title: 'Stop All Jets Now Stops the Whole Fleet in One Click',
    date: '22 Jul 2026',
    summary:
      'Fixed a bug where Stop All Jets would only shut down one printer per click, forcing the operator to press the button 13 times to cycle a full fleet down. Root cause was stale jetRunning flags coming from ping-only background polling — printers that were actually running were being skipped because CodeSync thought they were already off. Batch now pauses polling for its duration, targets every online, non-faulted, non-starting printer regardless of the cached flag, marks each successful stop optimistically in the UI, and reports a summary toast (stopped / skipped-starting / skipped-faulted / already-off).',
  },
  {
    id: 'start-jets-selection',
    type: 'feature',
    title: 'Start Jets… With Per-Printer Selection',
    date: '22 Jul 2026',
    summary:
      'Added a Start Jets… button alongside Stop All Jets on the Printers screen. Opens a multi-select dialog listing every online printer whose jet is currently off, with checkboxes and Select All, so the operator can start the whole fleet or just a subset (for example only the lines running that shift). Commands are sent serially with a 400 ms safety gap to avoid firmware collisions during the 66-second startup window.',
  },
  {
    id: 'per-printer-new-message-defaults',
    type: 'feature',
    title: 'Per-Printer New Message Defaults on the Setup Card',
    date: '21 Jul 2026',
    summary:
      'Added a "New Message Defaults" section to each Printer Setup Card so every printer can carry its own Width, Delay, Bold, Gap and Speed baseline for brand-new messages. Resolution priority is now Printer Setup Card → Fleet Defaults (Width 2, Delay 500, Ultra Fast) → Factory Fallback. Both new and existing messages inherit the correct baseline at Select time, and CodeSync pushes ^PW / ^DA / ^CM so the values land on the printer instead of reverting to HMI-side defaults (Width 15, Delay 100, Fastest).',
  },
  {
    id: 'width-speed-persist-fix',
    type: 'bugfix',
    title: 'Width, Delay and Speed Now Stick Per Printer',
    date: '19 Jul 2026',
    summary:
      'Fixed a bug where editing a message\'s Adjust settings on one printer and then copying or selecting that message on another printer would revert Width, Delay and Speed to the old defaults (Width 15, Delay 100, Fastest). CodeSync now reads each parameter individually from the printer, stores tuning against the exact message + printer combination, and pushes those stored values on every selection. First-time sends still seed from the source message so the technician only tunes once.',
  },
  {
    id: 'wp7-migration-safety',
    type: 'feature',
    title: 'Squid-Style Auto-Select Works for Existing Messages',
    date: '18 Jul 2026',
    summary:
      'One-time migration on startup seeds the sent-to history from every message already stored on every printer, so the Copy and Select dialogs pre-check the correct printers even for messages that were deployed before history tracking existed. History for decommissioned printers is pruned automatically. No schema change, fully backward compatible.',
  },
  {
    id: 'wp6-hmi-ack',
    type: 'feature',
    title: 'HMI-Side Message Selection Respected',
    date: '18 Jul 2026',
    summary:
      'When an operator selects a message directly at the printer keypad, CodeSync detects the change on the next status poll and updates the on-screen "current message" without fighting the operator or pushing a different message back down. Documented in the Messages chapter of the User Manual.',
  },
  {
    id: 'wp5-stack-view',
    type: 'feature',
    title: 'This Message on Other Printers Panel',
    date: '18 Jul 2026',
    summary:
      'The message editor now has a collapsible "[Message] on N other printers" panel showing each sibling printer\'s Line ID, Width, Delay, Bold, Gap, Speed, Rotation and last-sent timestamp. The current printer is pinned first, then the most recently sent. Read-only quick parity check across the fleet.',
  },
  {
    id: 'wp4-retry-ignore',
    type: 'feature',
    title: 'Retry / Ignore Dialog for Failed Copies',
    date: '18 Jul 2026',
    summary:
      'When a Copy-to-Printers push fails on one or more targets, a dialog now lists every failed printer with the exact rejection reason (offline, command error, timeout). Try Again re-runs only the failed subset, capped at three attempts. Ignore dismisses and continues.',
  },
  {
    id: 'wp2-3-history-autocheck',
    type: 'feature',
    title: 'Sent-To History and Auto-Selection',
    date: '18 Jul 2026',
    summary:
      'Every successful hardware push is now logged per message per printer. The Copy-to-Printers and Select-Message dialogs automatically pre-check every printer that has previously run the message, turning a whole-fleet resend into a single click.',
  },
  {
    id: 'wp1-preserve-tuning',
    type: 'feature',
    title: 'Copy Preserves Each Printer\'s Tuning',
    date: '18 Jul 2026',
    summary:
      'Copying a message to other printers now updates only the content (fields, text, barcodes) and leaves each target printer\'s Width, Delay, Bold, Gap and Speed alone. First-time sends to a printer that has never run a message still seed from the source so the technician only tunes once. Rotation continues to come from the Printer Setup Card (Flip / Mirror Flip).',
  },
  {
    id: 'per-printer-message-settings',
    type: 'feature',
    title: 'Per-Printer Message Settings (Squid-Style Parity)',
    date: '18 Jul 2026',
    summary:
      'Foundation rework of how message tuning is stored across the fleet. Each printer now keeps its own Width, Delay, Bold, Gap and Speed for every message — the message name is shared, the tuned numbers are not. Fleet defaults for new messages are Width 2, Delay 500, Ultra Fast. Rotation is always resolved from the Printer Setup Card at send time so Flip and Mirror Flip printers on the same conveyor stay correct regardless of the source message.',
  },
  {
    id: 'faster-message-select',
    type: 'feature',
    title: 'Much Faster Message Selection Across the Fleet',
    date: '18 Jul 2026',
    summary:
      'Selecting a message across a full fleet is now dramatically faster. A 13-printer network that previously took around 4.5 minutes to complete a message change now finishes in roughly 20–30 seconds. Printers now communicate in parallel with their own safety lock rather than waiting in a single shared queue, and redundant read-back checks on user-defined fields were removed.',
  },
  {
    id: 'sync-adjust',
    type: 'feature',
    title: 'Sync Adjust From Printer',
    date: '17 Jul 2026',
    summary:
      'Added a global Sync Adjust action on the Printers screen and a per-printer Sync button. If an operator tweaks Width, Delay, Bold, Gap or Speed directly at the printer keypad, one click pulls those live values back into the stored message so the next send does not overwrite their change.',
  },
  {
    id: 'multi-printer-expiry',
    type: 'feature',
    title: 'Change Custom Expiry Across Multiple Printers',
    date: '17 Jul 2026',
    summary:
      'The expiry override dialog now supports multi-select with a Select All shortcut, matching the message-selection workflow. Push a 45-to-44-day expiry change down to any subset of printers in one action.',
  },
  {
    id: 'line-id-refresh',
    type: 'bugfix',
    title: 'Line ID Always Pulled From Printer Setup Card',
    date: '17 Jul 2026',
    summary:
      'Line ID fields inside a message now re-resolve against the target printer\'s Setup Card whenever the message is opened, copied or selected. Stale Line IDs from a source printer can no longer be pushed onto a different line.',
  },
  {
    id: 'message-protection',
    type: 'feature',
    title: 'Message Protection Lock',
    date: '17 Jul 2026',
    summary:
      'Added a per-message Protect / Unlock toggle with a lock icon. Protected messages (for example a 60DAYBACKUPCODE manual-backup message using the printer\'s User Prompt function) are shielded from being overwritten by Copy, Select or Sync operations, preserving fields CodeSync does not yet fully support.',
  },
  {
    id: 'copy-to-printers',
    type: 'feature',
    title: 'Copy Message to Other Printers',
    date: '16 Jul 2026',
    summary:
      'New Copy to… button on the Messages screen. Duplicates the current message to any subset of sibling printers in the fleet with per-target rotation and expiry overrides. Includes multi-select checkboxes, Select All, and a compact 4-per-row printer grid.',
  },
  {
    id: 'stop-all-jets',
    type: 'feature',
    title: 'One Button Stop All Jets',
    date: '17 Jul 2026',
    summary:
      'Added a single "Stop All Jets" control on the Printers screen. It shuts down every running jet in sequence with safe timing, skipping printers that are already stopped, so the end-of-evening cycle down is controlled and reliable.',
  },
  {
    id: 'start-jet-status-fix',
    type: 'bugfix',
    title: 'Start Jet Status Tracking Fixed',
    date: '17 Jul 2026',
    summary:
      'Fixed a bug where starting a jet on one printer could incorrectly mark the previously-started printer as stopped in the software. Jet running state is now updated optimistically when a Start/Stop command is sent and confirmed by status polls, so "Stop All Jets" correctly targets every physically running jet.',
  },
  {
    id: 'auto-reconnect',
    type: 'bugfix',
    title: 'Auto-Reconnect for Dropped Printers',
    date: '17 Jul 2026',
    summary:
      'Occasional false-offline drops during long production runs are now recovered automatically. CodeSync retries the connection up to three times over 60 seconds and adds a 150-second grace window after a Stop Jet command to prevent spurious offline flags during shutdown.',
  },
];

const WHATS_NEW_READ_KEY = 'codesync.whatsNewReadId';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseNoteDate(date: string): number {
  const match = date.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return 0;
  const month = MONTHS.indexOf(match[2]);
  return new Date(Number(match[3]), month === -1 ? 0 : month, Number(match[1])).getTime();
}

// Newest first; ties keep their insertion order (stable sort).
const SORTED_RELEASE_NOTES = [...RELEASE_NOTES].sort(
  (a, b) => parseNoteDate(b.date) - parseNoteDate(a.date)
);

function getLatestNoteId() {
  return SORTED_RELEASE_NOTES[0]?.id ?? '';
}

function hasUnreadNote() {
  try {
    const lastRead = localStorage.getItem(WHATS_NEW_READ_KEY);
    return lastRead !== getLatestNoteId();
  } catch {
    return false;
  }
}

function markRead() {
  try {
    localStorage.setItem(WHATS_NEW_READ_KEY, getLatestNoteId());
  } catch {
    /* ignore */
  }
}

interface WhatsNewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WhatsNewDialog({ open, onOpenChange }: WhatsNewDialogProps) {
  useEffect(() => {
    if (open) markRead();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md max-h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b border-border bg-muted/30">
          <DialogTitle className="text-base md:text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            What&apos;s New
          </DialogTitle>
          <DialogDescription className="text-xs md:text-sm">
            Recent bug fixes and new features in CodeSync.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh]">
          <div className="p-4 space-y-4">
            {SORTED_RELEASE_NOTES.map((note) => (
              <div
                key={note.id}
                className={cn(
                  'rounded-lg border p-3 space-y-2',
                  note.type === 'feature'
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : 'border-blue-500/20 bg-blue-500/5'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        note.type === 'feature'
                          ? 'bg-emerald-500/20 text-emerald-600'
                          : 'bg-blue-500/20 text-blue-600'
                      )}
                    >
                      {note.type === 'feature' ? (
                        <Zap className="w-3 h-3" />
                      ) : (
                        <Wrench className="w-3 h-3" />
                      )}
                      {note.type === 'feature' ? 'New Feature' : 'Bug Fix'}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {note.date}
                    </span>
                  </div>
                </div>
                <h3 className="text-sm md:text-base font-semibold leading-tight">
                  {note.title}
                </h3>
                <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                  {note.summary}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function WhatsNewButton({
  className,
  onClick,
  label,
}: {
  className?: string;
  onClick?: () => void;
  label?: string;
}) {
  const [hasUnread, setHasUnread] = useState(hasUnreadNote);

  useEffect(() => {
    setHasUnread(hasUnreadNote());
  }, []);

  return (
    <button
      onClick={() => {
        setHasUnread(false);
        onClick?.();
      }}
      className={cn(
        'relative inline-flex items-center justify-center rounded-full transition-colors',
        label && 'gap-1',
        className
      )}
      title="What's New"
      aria-label="What's New"
    >
      <Sparkles className={cn('w-4 h-4 md:w-5 md:h-5', label && 'mb-0')} />
      {label && <span className="text-[10px] md:text-xs">{label}</span>}
      {hasUnread && (
        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
        </span>
      )}
    </button>
  );
}
