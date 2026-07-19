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

function getLatestNoteId() {
  return RELEASE_NOTES[0]?.id ?? '';
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
            {RELEASE_NOTES.map((note) => (
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
